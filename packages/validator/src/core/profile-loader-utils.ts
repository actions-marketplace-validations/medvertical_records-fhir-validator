/**
 * Profile Loader Utilities
 * 
 * Utilities for loading StructureDefinitions and generating snapshots.
 * Extracted from validator-engine.ts to comply with global.mdc guidelines.
 */

import type { StructureDefinition } from './structure-definition-types';
import type { ValidationIssue, ValidationSettings } from '../types';
import { StructureDefinitionLoader } from './structure-definition-loader';
import { ProfileCache } from '../cache/profile-cache';
import { SnapshotGenerator } from './snapshot-generator';
import { logger } from '../logger';
import { getIncompatibleProfileResourceType } from './profile-resource-type';
import type { ProfileSourceContext } from '../persistence';

/** Minimal interface for FHIR client to avoid circular dependencies */
export interface FhirClientLike {
  searchResources(resourceType: string, params: Record<string, string>, count?: number, options?: Record<string, unknown>): Promise<{ entry?: Array<{ resource: StructureDefinition }> }>;
}

/**
 * Load a profile with snapshot generation if needed
 */
export async function loadProfileWithSnapshot(
  sdLoader: StructureDefinitionLoader,
  profileCache: ProfileCache,
  snapshotGenerator: SnapshotGenerator,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  _fhirClient?: FhirClientLike
): Promise<StructureDefinition | null> {
  const cacheKey = `${profileUrl}:${fhirVersion}:snapshot`;

  // 1. Check ProfileCache first (L1)
  const cached = profileCache.get(cacheKey);
  if (cached) {
    logger.debug(`[RecordsValidator] Cache hit for ${profileUrl}`);
    return cached as StructureDefinition;
  }

  // 2. Load through the configured profile loader. It checks local cache,
  // bundled packages, Simplifier, and the package registry; it does not query
  // the selected resource FHIR server for StructureDefinitions.
  let structureDef = await sdLoader.loadProfile(profileUrl, fhirVersion);

  if (!structureDef) {
    return null;
  }

  // Generate snapshot if missing (with caching)
  if (!structureDef.snapshot && structureDef.differential && structureDef.baseDefinition) {
    logger.info(`[RecordsValidator] Profile has no snapshot, generating from differential...`);
    const elements = await snapshotGenerator.generateSnapshot(structureDef);

    if (elements && elements.length > 0) {
      const withSnapshot: StructureDefinition = {
        ...structureDef,
        snapshot: { element: elements }
      };
      profileCache.set(cacheKey, withSnapshot);
      structureDef = withSnapshot;
    }
  } else {
    // Cache the loaded profile even if it already had a snapshot
    profileCache.set(cacheKey, structureDef);
  }

  return structureDef;
}

/**
 * Result of loading a profile with base-SD fallback.
 * `usedBaseFallback` is true when the declared profile was unresolvable
 * and we fell back to the resource type's base StructureDefinition so
 * callers can still emit a warning and run the non-profile aspects.
 */
export interface ProfileLoadResult {
  structureDef: StructureDefinition | null;
  declaredProfileUrl: string;
  usedBaseFallback: boolean;
  incompatibleProfileType?: string;
}

/**
 * Load a profile with base-SD fallback.
 *
 * Why this exists: if a resource declares `meta.profile` pointing at a URL
 * the loader can't resolve (unknown IG, typo), returning null causes the
 * batch validator to skip ALL aspects. HAPI falls back to the resource
 * type's base SD in that case. We do the same so structural / invariant /
 * reference / metadata issues still surface.
 */
export async function loadProfileOrBase(
  sdLoader: StructureDefinitionLoader,
  snapshotGenerator: SnapshotGenerator,
  declaredProfileUrl: string,
  resourceType: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  profileCache?: ProfileCache,
  fhirClient?: FhirClientLike,
  resolutionContext?: ProfileSourceContext,
  settings?: ValidationSettings,
): Promise<ProfileLoadResult> {
  const declared = await loadProfileForValidation(
    sdLoader,
    snapshotGenerator,
    declaredProfileUrl,
    fhirVersion,
    profileCache,
    fhirClient,
    resolutionContext,
    settings,
  );
  if (declared) {
    const incompatibleProfileType = getIncompatibleProfileResourceType(declared, resourceType);
    if (incompatibleProfileType) {
      const baseUrl = `http://hl7.org/fhir/StructureDefinition/${resourceType}`;
      const base = declaredProfileUrl === baseUrl
        ? null
        : await loadProfileForValidation(
          sdLoader,
          snapshotGenerator,
          baseUrl,
          fhirVersion,
          profileCache,
          fhirClient,
          resolutionContext,
          settings,
        );
      return {
        structureDef: base,
        declaredProfileUrl,
        usedBaseFallback: base !== null,
        incompatibleProfileType,
      };
    }
    return { structureDef: declared, declaredProfileUrl, usedBaseFallback: false };
  }
  const baseUrl = `http://hl7.org/fhir/StructureDefinition/${resourceType}`;
  if (declaredProfileUrl === baseUrl) {
    return { structureDef: null, declaredProfileUrl, usedBaseFallback: false };
  }
  const base = await loadProfileForValidation(
    sdLoader,
    snapshotGenerator,
    baseUrl,
    fhirVersion,
    profileCache,
    fhirClient,
    resolutionContext,
    settings,
  );
  return {
    structureDef: base,
    declaredProfileUrl,
    usedBaseFallback: base !== null,
  };
}

/**
 * Build the warning issue emitted when a declared profile couldn't be
 * resolved and validation fell back to the resource type's base SD.
 */
export function createProfileFallbackIssue(
  profileUrl: string,
  resourceType: string,
  profileSource?: Pick<StructureDefinitionLoader, 'getAvailableProfiles'>
): ValidationIssue {
  const baseProfile = `http://hl7.org/fhir/StructureDefinition/${resourceType}`;
  const suggestedProfiles = suggestProfilesForUnresolvedCanonical(
    profileUrl,
    profileSource?.getAvailableProfiles?.() ?? []
  );
  const details: Record<string, unknown> = {
    profile: profileUrl,
    resourceType,
    baseProfile,
    validatedAgainstBase: true,
    profileResolutionStatus: 'unresolved',
    profileApplicationStatus: 'not-applied',
    validationComplete: false,
  };
  if (suggestedProfiles.length > 0) {
    details.suggestedProfiles = suggestedProfiles;
  }

  return {
    id: `records-profile-not-resolved-${Date.now()}`,
    aspect: 'profile',
    severity: 'warning',
    code: 'profile-not-resolved',
    message: `Profile ${profileUrl} could not be resolved; validated against base ${resourceType} instead`,
    path: 'meta.profile',
    timestamp: new Date(),
    details,
    profile: profileUrl,
  };
}

export function suggestProfilesForUnresolvedCanonical(
  profileUrl: string,
  availableProfiles: string[],
  limit = 3
): string[] {
  const target = splitStructureDefinitionCanonical(profileUrl);
  if (!target) return [];

  const seen = new Set<string>();
  return availableProfiles
    .map(stripCanonicalVersion)
    .filter(candidate => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      const parsed = splitStructureDefinitionCanonical(candidate);
      return parsed?.prefix === target.prefix && parsed.suffix !== target.suffix;
    })
    .map(candidate => ({
      candidate,
      score: profileTailSimilarity(target.suffix, splitStructureDefinitionCanonical(candidate)?.suffix ?? ''),
    }))
    .filter(result => result.score >= 0.7)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, Math.max(0, limit))
    .map(result => result.candidate);
}

function stripCanonicalVersion(url: string): string {
  return url.split('|')[0];
}

function splitStructureDefinitionCanonical(url: string): { prefix: string; suffix: string } | null {
  const canonical = stripCanonicalVersion(url);
  const marker = '/StructureDefinition/';
  const index = canonical.indexOf(marker);
  if (index < 0) return null;
  return {
    prefix: canonical.slice(0, index + marker.length).toLowerCase(),
    suffix: canonical.slice(index + marker.length).toLowerCase(),
  };
}

function profileTailSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = tokenizeProfileTail(left);
  const rightTokens = new Set(tokenizeProfileTail(right));
  const shared = leftTokens.filter(token => rightTokens.has(token)).length;
  const tokenScore = shared === 0
    ? 0
    : (2 * shared) / (leftTokens.length + rightTokens.size);

  const distance = levenshteinDistance(left, right);
  const editScore = 1 - distance / Math.max(left.length, right.length);
  return Math.max(tokenScore, editScore);
}

function tokenizeProfileTail(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export { createProfileResourceTypeMismatchIssue } from './profile-resource-type';

/**
 * Load a profile and ensure snapshot exists (for validate method)
 */
export async function loadProfileForValidation(
  sdLoader: StructureDefinitionLoader,
  snapshotGenerator: SnapshotGenerator,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  profileCache?: ProfileCache, // Optional for backward compat, but recommended
  _fhirClient?: FhirClientLike,
  resolutionContext?: ProfileSourceContext,
  _settings?: ValidationSettings,
): Promise<StructureDefinition | null> {
  const cacheKey = `${profileUrl}:${fhirVersion}:snapshot`;
  const effectiveContext = resolutionContext ?? sdLoader.getProfileResolutionContext?.();
  const tenantScopedProfile = effectiveContext?.organizationId !== undefined &&
    !profileUrl.split('|')[0].startsWith('http://hl7.org/fhir/StructureDefinition/');

  // 1. Check ProfileCache (L1)
  if (profileCache && !tenantScopedProfile) {
    const cached = profileCache.get(cacheKey);
    if (cached) {
      return cached as StructureDefinition;
    }
  }

  // 2. Load through the configured profile loader. The resource FHIR client is
  // intentionally not a profile source.
  let structureDef = await sdLoader.loadProfile(profileUrl, fhirVersion);

  if (!structureDef) {
    return null;
  }

  // Generate snapshot if missing (profile only has differential)
  if (!structureDef.snapshot && structureDef.differential && structureDef.baseDefinition) {
    logger.info(`[RecordsValidator] ⚠️  Profile has no snapshot, only differential. Generating snapshot...`);

    // Log differential constraints before generation
    const diffRootConstraints = structureDef.differential.element
      ?.find(el => el.path === structureDef.type)
      ?.constraint?.filter(c => !c.key.startsWith('dom-')) || [];
    logger.info(`[RecordsValidator] 📋 Profile-specific constraints in differential: ${diffRootConstraints.map(c => c.key).join(', ') || 'none'}`);

    const snapshotElements = await snapshotGenerator.generateSnapshot(structureDef);

    if (snapshotElements && snapshotElements.length > 0) {
      structureDef.snapshot = { element: snapshotElements };

      // Log constraints after snapshot generation
      const snapshotRootConstraints = snapshotElements
        .find(el => el.path === structureDef.type)
        ?.constraint?.filter(c => !c.key.startsWith('dom-')) || [];
      logger.info(`[RecordsValidator] ✅ Generated snapshot with ${snapshotElements.length} elements`);
      logger.info(`[RecordsValidator] 📋 Profile-specific constraints in snapshot: ${snapshotRootConstraints.map(c => c.key).join(', ') || 'none'}`);

      if (profileCache) profileCache.set(cacheKey, structureDef);
    } else {
      logger.error(`[RecordsValidator] ✗ Failed to generate snapshot for ${profileUrl}`);
      return null;
    }
  } else if (profileCache) {
    // Cache result
    profileCache.set(cacheKey, structureDef);
  }

  return structureDef;
}
