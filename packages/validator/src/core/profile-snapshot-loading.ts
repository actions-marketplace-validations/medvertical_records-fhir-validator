import type { ProfileCache } from '../cache/profile-cache';
import { logger } from '../logger';
import type { ProfileSourceContext } from '../persistence';
import type { ValidationSettings } from '../types';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { matchesRequestedFhirVersion } from './sd-loader-version-utils';
import type { SnapshotGenerator } from './snapshot-generator';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { StructureDefinition } from './structure-definition-types';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import {
  isTenantScopedProfileRequest,
  resolveTenantProfileFromSource,
} from './tenant-profile-source-resolution';

export interface FhirClientLike {
  searchResources(
    resourceType: string,
    params: Record<string, string>,
    count?: number,
    options?: Record<string, unknown>,
  ): Promise<{ entry?: Array<{ resource: StructureDefinition }> }>;
}

export async function loadProfileWithSnapshot(
  sdLoader: StructureDefinitionLoader,
  profileCache: ProfileCache,
  snapshotGenerator: SnapshotGenerator,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  _fhirClient?: FhirClientLike,
): Promise<StructureDefinition | null> {
  const cacheKey = `${profileUrl}:${fhirVersion}:snapshot`;
  const cached = profileCache.get(cacheKey);
  if (cached) {
    logger.debug('[RecordsValidator] Profile snapshot cache hit', profileCanonicalMetadata(profileUrl));
    return cached as StructureDefinition;
  }
  const structureDef = await sdLoader.loadProfile(profileUrl, fhirVersion);
  if (!structureDef) return null;
  return ensureSnapshot(structureDef, snapshotGenerator, profileCache, cacheKey, profileUrl);
}

export async function loadProfileForValidation(
  sdLoader: StructureDefinitionLoader,
  snapshotGenerator: SnapshotGenerator,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  profileCache?: ProfileCache,
  _fhirClient?: FhirClientLike,
  resolutionContext?: ProfileSourceContext,
  settings?: ValidationSettings,
): Promise<StructureDefinition | null> {
  const cacheKey = `${profileUrl}:${fhirVersion}:snapshot`;
  const context = resolutionContext ?? sdLoader.getProfileResolutionContext?.();
  const tenantScoped = isTenantScopedProfileRequest(profileUrl, context);
  if (profileCache && !tenantScoped) {
    const cached = profileCache.get(cacheKey);
    if (cached) return cached as StructureDefinition;
  }

  let structureDef = await sdLoader.loadProfile(profileUrl, fhirVersion);
  if (!structureDef && tenantScoped) {
    structureDef = await resolveTenantProfile(profileUrl, fhirVersion, context, settings);
  }
  if (!structureDef) return null;
  return ensureSnapshot(structureDef, snapshotGenerator, profileCache, cacheKey, profileUrl);
}

async function resolveTenantProfile(
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  context: ProfileSourceContext,
  settings?: ValidationSettings,
): Promise<StructureDefinition | null> {
  try {
    const profile = await resolveTenantProfileFromSource(
      profileUrl,
      fhirVersion,
      context,
      settings,
    );
    return profile
      && matchesRequestedFhirVersion(profile, fhirVersion)
      ? profile
      : null;
  } catch (error: unknown) {
    logger.debug('[RecordsValidator] Tenant profile resolver fallback failed', validationFailureMetadata(error));
    return null;
  }
}

async function ensureSnapshot(
  structureDef: StructureDefinition,
  snapshotGenerator: SnapshotGenerator,
  profileCache: ProfileCache | undefined,
  cacheKey: string,
  profileUrl: string,
): Promise<StructureDefinition | null> {
  if (structureDef.snapshot || !structureDef.differential || !structureDef.baseDefinition) {
    profileCache?.set(cacheKey, structureDef);
    return structureDef;
  }
  logger.info('[RecordsValidator] Profile has no snapshot; generating from differential');
  const snapshotElements = await snapshotGenerator.generateSnapshot(structureDef);
  if (!snapshotElements?.length) {
    logger.error('[RecordsValidator] Failed to generate profile snapshot', profileCanonicalMetadata(profileUrl));
    return null;
  }
  const materialized = { ...structureDef, snapshot: { element: snapshotElements } };
  profileCache?.set(cacheKey, materialized);
  return materialized;
}
