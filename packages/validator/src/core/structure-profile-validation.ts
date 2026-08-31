import { logger } from '../logger';
import type { ProfileCache } from '../cache/profile-cache';
import type { SnapshotGenerator } from './snapshot-generator';
import type { StructuralExecutor } from './executors';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { ValidationIssue } from '../types';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import type { FhirResource } from './fhir-resource';
import { loadProfileWithSnapshot } from './profile-loader-utils';
import {
  createProfileResourceTypeMismatchIssue,
  getIncompatibleProfileResourceType,
} from './profile-resource-type';
import { getValueAtPath } from './validation-utils';

export interface StructureProfileValidationDeps {
  sdLoader: StructureDefinitionLoader;
  profileCache: ProfileCache;
  snapshotGenerator: SnapshotGenerator;
  structuralExecutor: StructuralExecutor;
}

export async function validateStructureProfile(
  resource: FhirResource,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  deps: StructureProfileValidationDeps,
): Promise<ValidationIssue[]> {
  logger.debug('[RecordsValidator] Checking structure profile', profileCanonicalMetadata(profileUrl));

  const loadedStructureDef = await loadProfileWithSnapshot(
    deps.sdLoader,
    deps.profileCache,
    deps.snapshotGenerator,
    profileUrl,
    fhirVersion,
  );

  if (!loadedStructureDef) {
    logger.warn('[RecordsValidator] Failed to load structure profile', profileCanonicalMetadata(profileUrl));
    return [];
  }

  if (!loadedStructureDef.snapshot?.element) {
    return [];
  }

  const incompatibleProfileType = getIncompatibleProfileResourceType(
    loadedStructureDef,
    resource.resourceType,
  );
  if (incompatibleProfileType) {
    return [
      createProfileResourceTypeMismatchIssue(
        profileUrl,
        resource.resourceType,
        incompatibleProfileType,
      ),
    ];
  }

  const requiredFieldIssues = await deps.structuralExecutor.validateRequiredFields(
    resource,
    loadedStructureDef,
    profileUrl,
    getValueAtPath,
    fhirVersion,
  );
  const { validateChoiceTypeProperties } = await import(
    '../validators/choice-type-property-validator.js'
  );

  return [
    ...requiredFieldIssues,
    ...validateChoiceTypeProperties(resource, loadedStructureDef),
  ];
}
