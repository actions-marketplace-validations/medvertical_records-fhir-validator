import type { StructureDefinition } from '../core/structure-definition-types';
import { isFhirResource } from '../core/fhir-resource';
import type { FhirVersionFamily } from '../core/sd-loader-version-utils';
import { logger } from '../logger';
import type { ValidationIssue } from '../types';
import { resourceTypeFromPath } from './slicing-content-rules';
import type { ConstraintValidator } from './constraint-validator';
import type { SliceDefinition } from './slice-types';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';

type TypeProfileResolver = (profileUrl: string) => Promise<StructureDefinition | null>;

export async function validateSliceTypeProfileConstraints(
  element: unknown,
  slice: SliceDefinition,
  elementPath: string,
  fhirVersion: FhirVersionFamily,
  typeProfileResolver: TypeProfileResolver | null,
  constraintValidator: ConstraintValidator,
  rootResource?: unknown,
): Promise<ValidationIssue[]> {
  if (!typeProfileResolver) return [];
  const issues: ValidationIssue[] = [];
  const visitedProfiles = new Set<string>();

  for (const typeSpec of slice.type ?? []) {
    for (const versionedProfileUrl of typeSpec.profile ?? []) {
      const profileUrl = versionedProfileUrl.split('|')[0];
      if (visitedProfiles.has(profileUrl)) continue;
      visitedProfiles.add(profileUrl);
      try {
        const typeProfile = await typeProfileResolver(versionedProfileUrl);
        const constraintElements = (typeProfile?.snapshot?.element ?? typeProfile?.differential?.element ?? [])
          .filter(candidate => (candidate.constraint?.length ?? 0) > 0);
        const typeRoot = typeProfile?.type;
        if (!typeProfile || !typeRoot || constraintElements.length === 0) continue;
        // The slice value is wrapped as a pseudo-resource so element paths
        // match the type profile, but FHIRPath `%resource` must still see the
        // resource that contains the slice (e.g. gender-amtlich-1 reads
        // `%resource.gender` from the Patient, not from the Extension).
        const profileIssues = await constraintValidator.validate(
          { ...asRecord(element), resourceType: typeRoot },
          constraintElements,
          typeProfile.url,
          { fhirVersion, ...(isFhirResource(rootResource) ? { rootResource } : {}) },
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
        logger.debug('[SlicingValidator] Failed to validate type profile constraints', {
          ...profileCanonicalMetadata(profileUrl),
          ...validationFailureMetadata(error),
        });
      }
    }
  }
  return issues;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
