import type { ValidationIssue } from '../types';
import type { ProfileCache } from '../cache/profile-cache';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { SnapshotGenerator } from './snapshot-generator';
import { buildBundleDocumentContextIssues, type BundleDocumentContextChildResult } from './bundle-document-context';
import { loadProfileWithSnapshot } from './profile-loader-utils';
import { getBundleEntryRequiredProfile } from './bundle-entry-slice-definitions';
import { isFhirResource, type FhirResource } from './fhir-resource';
import {
  createBundleEntryValidationFailureIssue,
  mapBundleEntryIssues,
} from './bundle-entry-validation-output';

export interface BundleEntryValidationDeps {
  sdLoader: StructureDefinitionLoader;
  profileCache: ProfileCache;
  snapshotGenerator: SnapshotGenerator;
  maxDepth: number;
  structuralExecutor: {
    validateResourceIdAndArrays(resource: FhirResource, contextQuestionnaire?: unknown): ValidationIssue[];
  };
  validateResource(
    resource: FhirResource,
    profileUrl: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<ValidationIssue[]>;
  validateNestedBundleEntries(
    bundle: FhirResource,
    fhirVersion: 'R4' | 'R5' | 'R6',
    recursionDepth: number,
  ): Promise<ValidationIssue[]>;
}

export async function validateBundleEntryResources(
  bundle: FhirResource,
  fhirVersion: 'R4' | 'R5' | 'R6',
  recursionDepth: number,
  deps: BundleEntryValidationDeps,
): Promise<ValidationIssue[]> {
  const out: ValidationIssue[] = [];
  const childResults: BundleDocumentContextChildResult[] = [];
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  if (entries.length === 0) return out;

  const bundleProfileUrl = getDeclaredProfile(bundle)
    ?? 'http://hl7.org/fhir/StructureDefinition/Bundle';
  const bundleStructureDef = await loadProfileWithSnapshot(
    deps.sdLoader,
    deps.profileCache,
    deps.snapshotGenerator,
    bundleProfileUrl,
    fhirVersion,
  ) ?? undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = asRecord(entries[i]);
    const entryResource = entry?.resource;
    if (!isFhirResource(entryResource)) continue;

    const profileUrl = getDeclaredProfile(entryResource) || getBundleEntryRequiredProfile(
      { entryResource, resourceType: entryResource.resourceType },
      bundleStructureDef,
    ) || `http://hl7.org/fhir/StructureDefinition/${entryResource.resourceType}`;

    let entryIssues: ValidationIssue[];
    try {
      entryIssues = await deps.validateResource(entryResource, profileUrl, fhirVersion);
      entryIssues.push(...deps.structuralExecutor.validateResourceIdAndArrays(entryResource));
      if (entryResource.resourceType === 'Bundle' && recursionDepth < deps.maxDepth) {
        entryIssues.push(...(await deps.validateNestedBundleEntries(entryResource, fhirVersion, recursionDepth + 1)));
      }
    } catch {
      const failureIssue = createBundleEntryValidationFailureIssue(i, entryResource.resourceType);
      out.push(failureIssue);
      childResults.push({
        index: i,
        entryResource,
        resourceType: entryResource.resourceType,
        issues: [failureIssue],
      });
      continue;
    }

    const mappedIssues = mapBundleEntryIssues(entryIssues, {
      entryIndex: i,
      resourceType: entryResource.resourceType,
      resourceId: typeof entryResource.id === 'string' && entryResource.id
        ? entryResource.id
        : undefined,
    });
    out.push(...mappedIssues.parentIssues);

    childResults.push({
      index: i,
      entryResource,
      resourceType: entryResource.resourceType,
      issues: mappedIssues.childIssues,
      structureDef: entryResource.resourceType === 'Composition'
        ? await loadProfileWithSnapshot(
          deps.sdLoader,
          deps.profileCache,
          deps.snapshotGenerator,
          profileUrl,
          fhirVersion,
        ) ?? undefined
        : undefined,
    });
  }

  out.push(...buildBundleDocumentContextIssues(bundle, childResults, bundleStructureDef));
  return out;
}

function getDeclaredProfile(resource: Record<string, unknown>): string | undefined {
  const meta = asRecord(resource.meta);
  return Array.isArray(meta?.profile)
    ? meta.profile.find((profile): profile is string => typeof profile === 'string')
    : typeof meta?.profile === 'string'
      ? meta.profile
      : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
