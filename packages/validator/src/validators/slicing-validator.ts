/**
 * Slicing Validator
 *
 * Validates sliced elements in FHIR resources:
 * - Identifies which slice each element belongs to
 * - Validates slice cardinality (min/max per slice)
 * - Validates discriminator matching
 * - Supports discriminator types: value, pattern, type, profile, exists
 * 
 * Critical for UK Core NHS Number validation (Patient.identifier slicing)
 */

import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import {
  sliceHasDiscriminatorEvidence,
} from './slice-discriminator-matcher';
import { extractSlicingInfo as externalExtractSlicingInfo } from './slice-info-extractor';
import type { ReferenceResolver, SliceDefinition } from './slice-types';
import type { StructureDefinition, SlicingDefinition } from '../core/structure-definition-types';
import { ValueSetPackageLoader } from './valueset-package-loader';
import { logger } from '../logger';
import {
  emitMatchedSliceChildIssues,
  resourceTypeFromPath,
  validateSliceContentConstraints,
  validateSliceRootConstraints,
} from './slicing-content-rules';
import { validateSliceOrdering } from './slicing-ordering';
import { createIsolatedSlicingValueSetLoader } from './slicing-valueset-loader';
import { type FhirVersionFamily } from '../core/sd-loader-version-utils';
import { ConstraintValidator } from './constraint-validator';
import { getValueAtPath } from './slice-utils';
import {
  elementCountsForSliceCardinality,
  isSliceCompatibleWithFhirVersion,
  matchElementToSlice,
  referenceDiscriminatorCouldNotBeResolved,
  shouldSuppressUnresolvedBindingClosedUnmatched,
  shouldSuppressUnresolvedBindingOnlyMin,
} from './slicing-match-policy';

// ============================================================================
// Types
// ============================================================================

// Re-export slicing types from core types
export type { SlicingDiscriminator, SlicingDefinition } from '../core/structure-definition-types';

export type { ReferenceResolver, SliceDefinition } from './slice-types';

/**
 * Callback used by the slicing validator to resolve a FHIR reference to the
 * referenced resource. Implementations typically look up the reference in
 * the current Bundle or `contained[]`.
 *
 * The resolver is **synchronous** — it must be able to answer from data the
 * caller already has in memory. Async resolution (e.g. remote reference
 * existence checks) should happen in a pre-pass via
 * `BatchedReferenceChecker` and the resolved bodies passed into the slicing
 * validator via this resolver.
 *
 * Returning `null` means "not resolvable" — the validator will then fall
 * back to matching against `value.meta.profile` as before.
 */
/**
 * Callback that resolves a profile URL to its StructureDefinition. Used by
 * the slicing validator to follow `type[].profile` on slice elements and
 * extract discriminator patterns (e.g. ISiKLoincCoding → patternUri on
 * Coding.system).
 */
export type TypeProfileResolver = (profileUrl: string) => Promise<StructureDefinition | null>;

// ============================================================================
// Slicing Validator
// ============================================================================

export class SlicingValidator {
  private typeProfileConstraintValidator = new ConstraintValidator();

  /**
   * Optional reference resolver used by the discriminator-by-profile matcher
   * to chase references inside Bundles / contained resources. Set via
   * `setReferenceResolver` from whichever validator owns the bundle context.
   */
  private referenceResolver: ReferenceResolver | null = null;

  /**
   * Optional profile resolver for looking up type profiles on slice elements.
   * When a slice has `type[].profile` (e.g. ISiKLoincCoding), the resolver
   * fetches the profile so discriminator patterns can be extracted.
   */
  private typeProfileResolver: TypeProfileResolver | null = null;

  /** Lazy-initialised loader for resolving ValueSet compose into code sets. */
  private valueSetLoader: ValueSetPackageLoader | null = null;

  private getValueSetLoader(): ValueSetPackageLoader {
    if (!this.valueSetLoader) {
      this.valueSetLoader = createIsolatedSlicingValueSetLoader();
    }
    return this.valueSetLoader;
  }

  /**
   * Provide a resolver so `matchProfileDiscriminator` can follow references
   * to check the referenced resource's `meta.profile`. Pass `null` to clear.
   */
  public setReferenceResolver(resolver: ReferenceResolver | null): void {
    this.referenceResolver = resolver;
  }

  /**
   * Provide a resolver for type profiles on slice elements.
   */
  public setTypeProfileResolver(resolver: TypeProfileResolver | null): void {
    this.typeProfileResolver = resolver;
  }

  /**
   * Validate slicing for a specific element path
   */
  // eslint-disable-next-line max-lines-per-function
  async validateSlicing(
    elements: any[],
    elementPath: string,
    profileSD: StructureDefinition,
    referenceResolverOverride?: ReferenceResolver | null,
    slicingElementId?: string,
    fhirVersion: FhirVersionFamily = 'R4',
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      // Get slicing definition for this path
      const slicingInfo = await this.extractSlicingInfo(elementPath, profileSD, slicingElementId);

      if (!slicingInfo || slicingInfo.slices.length === 0) {
        // No slicing defined for this element
        return issues;
      }
      const compatibleSlices = slicingInfo.slices.filter(slice => isSliceCompatibleWithFhirVersion(slice, fhirVersion));
      if (compatibleSlices.length === 0) {
        return issues;
      }

      // A discriminator child omitted by one slice is a wildcard for that
      // slice, not necessarily missing inherited metadata. The metadata is
      // unresolved only when no compatible slice carries evidence for the
      // discriminator at all. This matters for compound discriminators such
      // as (type, appliesTo), where a treatment slice intentionally accepts
      // every appliesTo value.
      const unresolvedDiscriminators = (slicingInfo.slicing.discriminator ?? [])
        .filter(discriminator => !compatibleSlices.some(slice =>
          sliceHasDiscriminatorEvidence(slice, discriminator)
        ))
        .map(discriminator => `${discriminator.type}:${discriminator.path || '$this'}`);
      if (unresolvedDiscriminators.length > 0) {
        return [createValidationIssue({
          code: 'profile-slice-validation-error',
          path: elementPath,
          resourceType: resourceTypeFromPath(elementPath),
          severityOverride: 'information',
          customMessage:
            `Slicing at '${elementPath}' could not be verified because inherited discriminator metadata ` +
            'was not resolved from the profile dependency.',
          details: {
            reason: 'unresolved-discriminator-metadata',
            unresolvedDiscriminators,
          },
        })];
      }

      const unresolvedSliceNames = compatibleSlices
        .filter(slice => !(slicingInfo.slicing.discriminator ?? []).some(discriminator =>
          sliceHasDiscriminatorEvidence(slice, discriminator)
        ))
        .map(slice => slice.sliceName);
      const hasUnresolvedSliceIdentity = unresolvedSliceNames.length > 0;
      if (hasUnresolvedSliceIdentity) {
        issues.push(createValidationIssue({
          code: 'profile-slice-validation-error',
          path: elementPath,
          resourceType: resourceTypeFromPath(elementPath),
          severityOverride: 'information',
          customMessage:
            `Slicing at '${elementPath}' could not be fully verified because inherited discriminator ` +
            'metadata was not resolved for one or more slices.',
          details: {
            reason: 'unresolved-slice-discriminator-metadata',
            unresolvedSliceNames,
          },
        }));
      }

      logger.debug(`[SlicingValidator] Validating ${elements.length} elements for path ${elementPath} with ${compatibleSlices.length} slices`);

      const effectiveReferenceResolver = referenceResolverOverride ?? this.referenceResolver ?? null;
      const hasUnresolvedReferenceDiscriminator = elements.some(element =>
        (slicingInfo.slicing.discriminator ?? []).some(discriminator =>
          referenceDiscriminatorCouldNotBeResolved(
            element,
            discriminator,
            effectiveReferenceResolver,
          )
        )
      );

      // Match each element to its slice
      const sliceMatches = new Map<string, Array<{ element: any; index: number }>>(); // sliceName -> matched elements with original index
      const cardinalityMatches = new Map<string, Array<{ element: any; index: number }>>();
      const unmatchedElements: Array<{ element: any; index: number }> = [];

      for (let index = 0; index < elements.length; index++) {
        const element = elements[index];
        const matchedSlice = matchElementToSlice(
          element,
          compatibleSlices,
          slicingInfo.slicing,
          effectiveReferenceResolver,
        );

        if (matchedSlice) {
          if (!sliceMatches.has(matchedSlice.sliceName)) {
            sliceMatches.set(matchedSlice.sliceName, []);
          }
          sliceMatches.get(matchedSlice.sliceName)!.push({ element, index });

          if (elementCountsForSliceCardinality(
            element,
            matchedSlice,
            slicingInfo.slicing.discriminator || [],
            compatibleSlices,
            effectiveReferenceResolver,
            slicingInfo.slicing.rules,
          )) {
            if (!cardinalityMatches.has(matchedSlice.sliceName)) {
              cardinalityMatches.set(matchedSlice.sliceName, []);
            }
            cardinalityMatches.get(matchedSlice.sliceName)!.push({ element, index });
          }
        } else {
          unmatchedElements.push({ element, index });
        }
      }

      // Validate cardinality for each slice
      for (const slice of compatibleSlices) {
        if (unresolvedSliceNames.includes(slice.sliceName)) {
          continue;
        }
        const matchedElements = sliceMatches.get(slice.sliceName) || [];
        const countedElements = cardinalityMatches.get(slice.sliceName) || [];
        const count = countedElements.length;
        const resourceType = resourceTypeFromPath(elementPath);

        // Check min cardinality
        if (
          count < slice.min &&
          !hasUnresolvedReferenceDiscriminator &&
          !shouldSuppressUnresolvedBindingOnlyMin(slice, elements)
        ) {
          issues.push(createValidationIssue({
            code: 'profile-slice-min-cardinality',
            path: elementPath,
            resourceType,
            messageParams: { slice: slice.sliceName, min: slice.min, actual: count },
            ruleId: `slice-min-${slice.sliceName}`,
            details: { sliceName: slice.sliceName },
          }));

          // Ghost nodes for the tree viewer are derived from the slice-level
          // cardinality issue above — emitting separate required-element-missing
          // issues for each child of an absent slice causes false positives
          // (Java only reports the slice cardinality error, not per-child errors).
        }

        // Check max cardinality
        if (slice.max !== '*') {
          const maxNum = parseInt(slice.max, 10);
          if (count > maxNum) {
            issues.push(createValidationIssue({
              code: 'profile-slice-max-cardinality',
              path: elementPath,
              resourceType,
              messageParams: { slice: slice.sliceName, max: slice.max, actual: count },
              ruleId: `slice-max-${slice.sliceName}`,
              details: { sliceName: slice.sliceName },
            }));
          }
        }

        // Validate slice content constraints (fixed/pattern values in nested elements)
        for (const matched of matchedElements) {
          const rootIssues = validateSliceRootConstraints(
            matched.element,
            slice,
            `${elementPath}[${matched.index}]`,
          );
          issues.push(...rootIssues);

          const contentIssues = validateSliceContentConstraints(
            matched.element,
            slice,
            `${elementPath}[${matched.index}]`,
            profileSD
          );
          issues.push(...contentIssues);

          // Report missing required / mustSupport direct children of the
          // matched slice element so the tree viewer can render ghosts for
          // them (e.g. name:name exists but lacks required family/given).
          const childIssues = emitMatchedSliceChildIssues(
            matched.element,
            slice,
            `${elementPath}[${matched.index}]`,
            profileSD
          );
          issues.push(...childIssues);

          issues.push(...await this.validateSliceTypeProfileConstraints(
            matched.element,
            slice,
            `${elementPath}[${matched.index}]`,
            fhirVersion,
          ));
        }
      }

      if (
        hasUnresolvedReferenceDiscriminator &&
        compatibleSlices.some(slice => (cardinalityMatches.get(slice.sliceName)?.length ?? 0) < slice.min)
      ) {
        issues.push(createValidationIssue({
          code: 'profile-slice-validation-error',
          path: elementPath,
          resourceType: resourceTypeFromPath(elementPath),
          severityOverride: 'information',
          customMessage:
            `Slicing at '${elementPath}' could not be verified because a reference used by its ` +
            'discriminator could not be resolved.',
          details: {
            reason: 'unresolved-reference-discriminator',
          },
        }));
      }

      // Check unmatched elements
      if (
        unmatchedElements.length > 0 &&
        slicingInfo.slicing.rules === 'closed' &&
        !hasUnresolvedReferenceDiscriminator &&
        !hasUnresolvedSliceIdentity &&
        !shouldSuppressUnresolvedBindingClosedUnmatched(compatibleSlices, slicingInfo.slicing)
      ) {
        issues.push(createValidationIssue({
          code: 'profile-slice-closed-unmatched',
          path: elementPath,
          resourceType: resourceTypeFromPath(elementPath),
          messageParams: { path: elementPath, count: unmatchedElements.length },
        }));
      }

      if (unmatchedElements.length > 0) {
        issues.push(...this.emitMissingDiscriminatorIssues(
          unmatchedElements,
          compatibleSlices,
          slicingInfo.slicing,
          elementPath,
          profileSD,
        ));
      }

      // Check ordering if required
      if (slicingInfo.slicing.ordered && sliceMatches.size > 1) {
        const orderIssues = validateSliceOrdering(
          elements,
          compatibleSlices,
          element => matchElementToSlice(
            element,
            compatibleSlices,
            { discriminator: compatibleSlices[0].discriminator },
            effectiveReferenceResolver,
          ),
          elementPath,
        );
        issues.push(...orderIssues);
      }

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[SlicingValidator] Error validating slicing:', error);
      issues.push(createValidationIssue({
        code: 'profile-slice-validation-error',
        path: elementPath,
        resourceType: resourceTypeFromPath(elementPath),
        customMessage: `Slicing validation failed: ${err.message}`,
      }));
    }

    return issues;
  }

  /**
   * Resolve type profiles on a slice element and merge their pattern/fixed
   * values into the child maps. When a slice's type carries a profile
   * (e.g. ISiKLoincCoding), the distinguishing value lives inside that
   * profile rather than on the slice element itself.
   */
  // Delegated to slice-info-extractor.ts.
  private async extractSlicingInfo(
    elementPath: string,
    profileSD: StructureDefinition,
    slicingElementId?: string,
  ) {
    return externalExtractSlicingInfo(
      elementPath, profileSD,
      this.typeProfileResolver,
      this.getValueSetLoader(),
      slicingElementId,
    );
  }

  private async validateSliceTypeProfileConstraints(
    element: any,
    slice: SliceDefinition,
    elementPath: string,
    fhirVersion: FhirVersionFamily,
  ): Promise<ValidationIssue[]> {
    if (!this.typeProfileResolver) return [];
    const issues: ValidationIssue[] = [];
    const visitedProfiles = new Set<string>();

    for (const typeSpec of slice.type ?? []) {
      for (const versionedProfileUrl of typeSpec.profile ?? []) {
        const profileUrl = versionedProfileUrl.split('|')[0];
        if (visitedProfiles.has(profileUrl)) continue;
        visitedProfiles.add(profileUrl);

        try {
          const typeProfile = await this.typeProfileResolver(versionedProfileUrl);
          const constraintElements = (typeProfile?.snapshot?.element ?? typeProfile?.differential?.element ?? [])
            .filter(candidate => (candidate.constraint?.length ?? 0) > 0);
          const typeRoot = typeProfile?.type;
          if (!typeProfile || !typeRoot || constraintElements.length === 0) continue;

          const syntheticDatatype = { ...element, resourceType: typeRoot };
          const profileIssues = await this.typeProfileConstraintValidator.validate(
            syntheticDatatype,
            constraintElements,
            typeProfile.url,
            { fhirVersion },
          );
          issues.push(...profileIssues.map(issue => {
            const sourcePath = issue.path ?? typeRoot;
            return {
              ...issue,
              path: sourcePath === typeRoot
                ? elementPath
                : sourcePath.startsWith(`${typeRoot}.`)
                  ? `${elementPath}${sourcePath.slice(typeRoot.length)}`
                  : elementPath,
              resourceType: resourceTypeFromPath(elementPath),
              profile: typeProfile.url,
            };
          }));
        } catch (error) {
          logger.debug(
            `[SlicingValidator] Failed to validate type profile constraints for ${profileUrl}:`,
            error,
          );
        }
      }
    }

    return issues;
  }
  /**
   * Open value slicing can otherwise hide an intended slice when the
   * discriminator itself is absent. For a single fixed-discriminator slice,
   * report a low-severity profile constraint on the sliced element if another
   * required child from that slice is present.
   */
  private emitMissingDiscriminatorIssues(
    unmatchedElements: Array<{ element: any; index: number }>,
    slices: SliceDefinition[],
    slicingDef: SlicingDefinition,
    elementPath: string,
    profileSD: StructureDefinition,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (slices.length !== 1 || slicingDef.discriminator?.length !== 1) return issues;

    const discriminator = slicingDef.discriminator[0];
    if (discriminator.type !== 'value' || !discriminator.path || discriminator.path === '$this') {
      return issues;
    }

    const slice = slices[0];
    const expectedValue = slice.childFixed?.get(discriminator.path)
      ?? slice.childPatterns?.get(discriminator.path)
      ?? (slice.fixed ? getValueAtPath(slice.fixed, discriminator.path) : undefined)
      ?? (slice.pattern ? getValueAtPath(slice.pattern, discriminator.path) : undefined);
    if (expectedValue === undefined || expectedValue === null) return issues;

    const evidencePaths = this.getRequiredSliceEvidencePaths(slice, discriminator.path, profileSD);
    if (evidencePaths.length === 0) return issues;

    for (const { element, index } of unmatchedElements) {
      const discriminatorValue = getValueAtPath(element, discriminator.path);
      if (discriminatorValue !== undefined && discriminatorValue !== null) continue;

      const hasEvidence = evidencePaths.some(path => {
        const value = getValueAtPath(element, path);
        return value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0);
      });
      if (!hasEvidence) continue;

      issues.push(createValidationIssue({
        code: 'profile-constraint-violation',
        path: `${elementPath}[${index}]`,
        resourceType: resourceTypeFromPath(elementPath),
        customMessage: `Slice '${slice.sliceName}' requires discriminator '${discriminator.path}' to be present`,
        severityOverride: 'info',
        ruleId: `slice-${slice.sliceName}-${discriminator.path}`,
        details: {
          sliceName: slice.sliceName,
          discriminatorPath: discriminator.path,
          expectedValue,
        },
      }));
    }

    return issues;
  }

  private getRequiredSliceEvidencePaths(
    slice: SliceDefinition,
    discriminatorPath: string,
    profileSD: StructureDefinition,
  ): string[] {
    const snapshot = profileSD.snapshot?.element;
    if (!snapshot?.length) return [];

    const idPrefix = `${slice.path}:${slice.sliceName}.`;
    const evidencePaths: string[] = [];

    for (const elementDef of snapshot) {
      const id = elementDef.id;
      if (!id || !id.startsWith(idPrefix)) continue;

      const relative = id.substring(idPrefix.length);
      if (relative.includes('.') || relative.includes(':')) continue;
      if (relative === discriminatorPath) continue;
      if ((elementDef.min ?? 0) < 1) continue;

      evidencePaths.push(relative);
    }

    return evidencePaths;
  }

}
