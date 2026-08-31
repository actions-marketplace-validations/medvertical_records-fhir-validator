/** Validates FHIR slice identity, cardinality, discriminators, and content. */

import type { ValidationIssue } from '../types';
import { extractSlicingInfo as externalExtractSlicingInfo } from './slice-info-extractor';
import type { ReferenceResolver } from './slice-types';
import type { StructureDefinition } from '../core/structure-definition-types';
import { createIsolatedSlicingValueSetLoader } from './slicing-valueset-loader';
import { type FhirVersionFamily } from '../core/sd-loader-version-utils';
import { ConstraintValidator } from './constraint-validator';
import { isSliceCompatibleWithFhirVersion } from './slicing-match-policy';
import type { ValueSetLoaderLike } from './slice-info-extractor';
import { handleSlicingValidationFailure } from './slicing-validation-failure';
import { validateResolvedSlicing } from './slicing-resolved-validation';
import { logSlicingValidationStart } from './slicing-validation-logging';

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

type SlicingInfoExtractor = typeof externalExtractSlicingInfo;

export interface SlicingValidatorDependencies {
  valueSetLoader?: ValueSetLoaderLike;
  extractSlicingInfo?: SlicingInfoExtractor;
}

// ============================================================================
// Slicing Validator
// ============================================================================

export class SlicingValidator {
  private typeProfileConstraintValidator = new ConstraintValidator();
  private mustSupportSeverity: 'warning' | 'information' = 'warning';

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
  private valueSetLoader: ValueSetLoaderLike | null;
  private readonly slicingInfoExtractor: SlicingInfoExtractor;

  constructor(dependencies: SlicingValidatorDependencies = {}) {
    this.valueSetLoader = dependencies.valueSetLoader ?? null;
    this.slicingInfoExtractor = dependencies.extractSlicingInfo ?? externalExtractSlicingInfo;
  }

  private getValueSetLoader(): ValueSetLoaderLike {
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

  public setMustSupportSeverity(severity: 'warning' | 'information'): void {
    this.mustSupportSeverity = severity;
  }

  /**
   * Validate slicing for a specific element path
   */
  async validateSlicing(
    elements: unknown[],
    elementPath: string,
    profileSD: StructureDefinition,
    referenceResolverOverride?: ReferenceResolver | null,
    slicingElementId?: string,
    fhirVersion: FhirVersionFamily = 'R4',
    rootResource?: unknown,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      // Get slicing definition for this path
      const slicingInfo = await this.extractSlicingInfo(elementPath, profileSD, slicingElementId);

      if (!slicingInfo || slicingInfo.slices.length === 0) {
        // No slicing defined for this element
        return issues;
      }
      const compatibleSlices = slicingInfo.slices.filter((slice) =>
        isSliceCompatibleWithFhirVersion(slice, fhirVersion),
      );
      if (compatibleSlices.length === 0) {
        return issues;
      }

      logSlicingValidationStart(elements.length, compatibleSlices.length, elementPath);

      const effectiveReferenceResolver = referenceResolverOverride ?? this.referenceResolver ?? null;
      issues.push(
        ...(await validateResolvedSlicing({
          elements,
          elementPath,
          profile: profileSD,
          slices: compatibleSlices,
          slicing: slicingInfo.slicing,
          referenceResolver: effectiveReferenceResolver,
          mustSupportSeverity: this.mustSupportSeverity,
          fhirVersion,
          typeProfileResolver: this.typeProfileResolver,
          typeProfileConstraintValidator: this.typeProfileConstraintValidator,
          rootResource,
        })),
      );
    } catch (error: unknown) {
      issues.push(handleSlicingValidationFailure(error, elementPath));
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
  private async extractSlicingInfo(elementPath: string, profileSD: StructureDefinition, slicingElementId?: string) {
    return this.slicingInfoExtractor(
      elementPath,
      profileSD,
      this.typeProfileResolver,
      this.getValueSetLoader(),
      slicingElementId,
    );
  }
}
