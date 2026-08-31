import type {
  SlicingDefinition,
  StructureDefinition,
} from '../core/structure-definition-types';
import type { FhirVersionFamily } from '../core/sd-loader-version-utils';
import type { ValidationIssue } from '../types';
import type { ConstraintValidator } from './constraint-validator';
import { buildAmbiguousSliceMatchIssues } from './slicing-ambiguous-matches';
import { assignElementsToSlices } from './slicing-match-assignment';
import { validateSlicingMatchSet } from './slicing-match-set-validation';
import { buildMissingDiscriminatorIssues } from './slicing-missing-discriminator';
import { validateMatchedSlices } from './slicing-slice-validation';
import { prepareDeclaredProfileAncestry } from './slice-profile-ancestry';
import type { ReferenceResolver, SliceDefinition } from './slice-types';
import { assessSlicingVerifiability } from './slicing-verifiability';

interface ResolvedSlicingValidationOptions {
  elements: unknown[];
  elementPath: string;
  profile: StructureDefinition;
  slices: SliceDefinition[];
  slicing: SlicingDefinition;
  referenceResolver: ReferenceResolver | null;
  typeProfileResolver: ((profileUrl: string) => Promise<StructureDefinition | null>) | null;
  typeProfileConstraintValidator: ConstraintValidator;
  mustSupportSeverity: 'warning' | 'information';
  fhirVersion: FhirVersionFamily;
  rootResource?: unknown;
}

/** Validate elements after slice metadata and FHIR-version compatibility are resolved. */
export async function validateResolvedSlicing(
  options: ResolvedSlicingValidationOptions,
): Promise<ValidationIssue[]> {
  const verifiability = assessSlicingVerifiability({
    slices: options.slices,
    slicing: options.slicing,
    elementPath: options.elementPath,
  });
  if (verifiability.blockingIssues.length > 0) {
    return verifiability.blockingIssues;
  }

  const issues = [...verifiability.advisoryIssues];
  await prepareDeclaredProfileAncestry(
    options.elements,
    options.slicing,
    options.typeProfileResolver,
  );
  const assignment = assignElementsToSlices(
    options.elements,
    options.slices,
    options.slicing,
    options.referenceResolver,
  );
  issues.push(
    ...buildAmbiguousSliceMatchIssues({
      elements: options.elements,
      slices: options.slices,
      slicing: options.slicing,
      referenceResolver: options.referenceResolver,
      elementPath: options.elementPath,
      profileUrl: options.profile.url,
    }),
  );
  issues.push(
    ...(await validateMatchedSlices({
      elements: options.elements,
      elementPath: options.elementPath,
      profile: options.profile,
      slices: options.slices,
      unresolvedSliceNames: verifiability.unresolvedSliceNames,
      sliceMatches: assignment.sliceMatches,
      cardinalityMatches: assignment.cardinalityMatches,
      hasUnresolvedReferenceDiscriminator: assignment.hasUnresolvedReferenceDiscriminator,
      mustSupportSeverity: options.mustSupportSeverity,
      fhirVersion: options.fhirVersion,
      typeProfileResolver: options.typeProfileResolver,
      typeProfileConstraintValidator: options.typeProfileConstraintValidator,
      rootResource: options.rootResource,
    })),
  );
  issues.push(
    ...validateSlicingMatchSet({
      elements: options.elements,
      elementPath: options.elementPath,
      slices: options.slices,
      slicing: options.slicing,
      cardinalityMatches: assignment.cardinalityMatches,
      unmatchedElementCount: assignment.unmatchedElements.length,
      hasUnresolvedReferenceDiscriminator: assignment.hasUnresolvedReferenceDiscriminator,
      hasUnresolvedSliceIdentity: verifiability.unresolvedSliceNames.size > 0,
      referenceResolver: options.referenceResolver,
    }),
  );

  if (assignment.unmatchedElements.length > 0) {
    issues.push(
      ...buildMissingDiscriminatorIssues(
        assignment.unmatchedElements,
        options.slices,
        options.slicing,
        options.elementPath,
        options.profile,
      ),
    );
  }

  return issues;
}
