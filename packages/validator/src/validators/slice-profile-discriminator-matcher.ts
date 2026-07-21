import type { SliceDefinition } from './slice-types';
import { getValueAtPath } from './slice-utils';
import {
  getTypeSpecsForDiscriminator,
  stripCanonicalVersion,
} from './slice-type-discriminator';
import { logger } from '../logger';

export type ReferenceResolverFn = ((ref: string) => any | null) | null;

export function matchProfileDiscriminator(
  element: any,
  slice: SliceDefinition,
  path: string,
  referenceResolver: ReferenceResolverFn,
  allSlices?: SliceDefinition[],
): boolean {
  const typeSpecs = getTypeSpecsForDiscriminator(slice, path);
  if (typeSpecs.length === 0) return false;

  const value = getValueAtPath(element, path);
  if (!value || typeof value !== 'object') return false;

  const requiredProfiles: string[] = [];
  const allowedTypeCodes: string[] = [];
  for (const typeSpec of typeSpecs) {
    if (typeSpec.code) allowedTypeCodes.push(typeSpec.code);
    if (typeSpec.profile && typeSpec.profile.length > 0) requiredProfiles.push(...typeSpec.profile);
    if (typeSpec.targetProfile && typeSpec.targetProfile.length > 0) requiredProfiles.push(...typeSpec.targetProfile);
  }

  if (value.meta && value.meta.profile && requiredProfiles.length > 0) {
    const profiles = toProfileArray(value.meta.profile);
    if (profiles.some(profile => profileListContains(requiredProfiles, profile))) return true;
  }

  if (typeof value.reference === 'string' && referenceResolver && requiredProfiles.length > 0) {
    try {
      const referenced = referenceResolver(value.reference);
      if (referenced?.meta?.profile) {
        const profiles = toProfileArray(referenced.meta.profile);
        if (profiles.some(profile => profileListContains(requiredProfiles, profile))) return true;
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.debug(`[SlicingValidator] Reference resolver threw: ${err.message}`);
    }
  }

  if (typeof value.resourceType === 'string' && allowedTypeCodes.length > 0) {
    if (allowedTypeCodes.includes(value.resourceType) &&
        typeCodesAreDistinguishing(slice, path, allSlices)) {
      return true;
    }
  }

  return false;
}

function typeCodesAreDistinguishing(
  currentSlice: SliceDefinition,
  path: string,
  allSlices?: SliceDefinition[],
): boolean {
  if (!allSlices || allSlices.length <= 1) return false;

  const currentCodes = collectTypeCodes(currentSlice, path);
  if (currentCodes.size === 0) return false;

  for (const otherSlice of allSlices) {
    if (otherSlice.sliceName === currentSlice.sliceName) continue;
    const otherCodes = collectTypeCodes(otherSlice, path);
    if (otherCodes.size === 0) continue;

    for (const code of currentCodes) {
      if (otherCodes.has(code)) return false;
    }
  }

  return true;
}

function collectTypeCodes(slice: SliceDefinition, path: string): Set<string> {
  const codes = new Set<string>();
  for (const t of getTypeSpecsForDiscriminator(slice, path)) {
    if (t.code) codes.add(t.code);
  }
  return codes;
}

export function toProfileArray(profile: unknown): string[] {
  if (Array.isArray(profile)) return profile.filter((p): p is string => typeof p === 'string');
  if (typeof profile === 'string') return [profile];
  return [];
}

export function profileListContains(profiles: string[], requestedProfile: string): boolean {
  return profiles.some(profile => profilesMatch(profile, requestedProfile));
}

function profilesMatch(left: string, right: string): boolean {
  return left === right || stripCanonicalVersion(left) === stripCanonicalVersion(right);
}
