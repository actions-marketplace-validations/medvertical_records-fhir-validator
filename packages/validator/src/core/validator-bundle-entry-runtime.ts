import type { ValidationIssue } from '../types';
import type { ProfileCache } from '../cache/profile-cache';
import type { ReferenceResolver } from '../validators/slicing-validator';
import type { StructuralExecutor } from './executors';
import type { SnapshotGenerator } from './snapshot-generator';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import { validateBundleEntryResources } from './validator-bundle-entry-validation';
import {
  BundleReferenceIndexCache,
  createBundleReferenceResolver,
} from './multi-aspect-bundle-reference-resolver';
import type { FhirResource } from './fhir-resource';

interface ValidatorBundleEntryRuntime {
  sdLoader: StructureDefinitionLoader;
  profileCache: ProfileCache;
  snapshotGenerator: SnapshotGenerator;
  structuralExecutor: StructuralExecutor;
  maxDepth: number;
  validateResource: (
    resource: FhirResource,
    profileUrl: string | undefined,
    fhirVersion: 'R4' | 'R5' | 'R6',
    referenceResolver: ReferenceResolver | null,
  ) => Promise<ValidationIssue[]>;
}

export async function validateRecordsBundleEntries(
  bundle: FhirResource,
  fhirVersion: 'R4' | 'R5' | 'R6',
  recursionDepth: number,
  runtime: ValidatorBundleEntryRuntime,
  referenceIndexCache = new BundleReferenceIndexCache(),
): Promise<ValidationIssue[]> {
  return validateBundleEntryResources(bundle, fhirVersion, recursionDepth, {
    sdLoader: runtime.sdLoader,
    profileCache: runtime.profileCache,
    snapshotGenerator: runtime.snapshotGenerator,
    maxDepth: runtime.maxDepth,
    structuralExecutor: runtime.structuralExecutor,
    validateResource: (resource, profileUrl, version) => runtime.validateResource(
      resource,
      profileUrl,
      version,
      createBundleReferenceResolver(bundle, resource, referenceIndexCache),
    ),
    validateNestedBundleEntries: (nestedBundle, version, nextDepth) =>
      validateRecordsBundleEntries(
        nestedBundle,
        version,
        nextDepth,
        runtime,
        referenceIndexCache,
      ),
  });
}
