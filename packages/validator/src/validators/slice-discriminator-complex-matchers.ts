import { getValueAtPath } from './slice-utils';
import type { SliceDefinition } from './slice-types';
import { getTypeSpecsForDiscriminator } from './slice-type-discriminator';
import {
  profileListContains,
  toProfileArray,
  type ReferenceResolverFn,
} from './slice-profile-discriminator-matcher';

export function resolvedResourceMatchesSliceTargetProfile(
  resolvedElement: any,
  slice: SliceDefinition,
): boolean {
  if (!resolvedElement || typeof resolvedElement !== 'object') return false;
  const targetProfiles = getTypeSpecsForDiscriminator(slice, '$this')
    .flatMap(spec => spec.targetProfile ?? []);
  if (targetProfiles.length === 0) return false;
  return toProfileArray(resolvedElement.meta?.profile)
    .some(profile => profileListContains(targetProfiles, profile));
}

export function canPatternCoreIdentifyCodingSlice(
  elementValue: any,
  slice: SliceDefinition,
  patternValue: any,
  allSlices: SliceDefinition[] | undefined,
  matchesPatternFn: (value: any, pattern: any) => boolean,
): boolean {
  if (slice.patternKind !== 'patternCoding') return false;
  if (!codingIdentityMatchesPattern(elementValue, patternValue)) return false;

  const candidateSlices = allSlices?.length ? allSlices : [slice];
  const matchingIdentitySlices = candidateSlices.filter(candidate =>
    candidate.patternKind === 'patternCoding' &&
    candidate.pattern !== undefined &&
    codingIdentityMatchesPattern(elementValue, candidate.pattern)
  );
  if (matchingIdentitySlices.length !== 1 || matchingIdentitySlices[0] !== slice) return false;
  return !candidateSlices.some(candidate =>
    candidate !== slice &&
    candidate.pattern !== undefined &&
    matchesPatternFn(elementValue, candidate.pattern)
  );
}

function codingIdentityMatchesPattern(elementValue: any, patternValue: any): boolean {
  if (!isRecord(elementValue) || !isRecord(patternValue)) return false;
  if (typeof patternValue.system !== 'string' || typeof patternValue.code !== 'string') return false;
  return elementValue.system === patternValue.system && elementValue.code === patternValue.code;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function matchWholeElementChildConstraints(
  elementValue: any,
  slice: SliceDefinition,
  matchesPatternFn: (value: any, pattern: any) => boolean,
): boolean | null {
  let hasConstraint = false;
  for (const [childPath, childPattern] of slice.childPatterns ?? []) {
    hasConstraint = true;
    if (!matchesPatternFn(getValueAtPath(elementValue, childPath), childPattern)) return false;
  }
  for (const [childPath, childFixed] of slice.childFixed ?? []) {
    hasConstraint = true;
    if (!matchesPatternFn(getValueAtPath(elementValue, childPath), childFixed)) return false;
  }
  return hasConstraint ? true : null;
}

export function matchExistsDiscriminator(element: any, path: string): boolean {
  const value = getValueAtPath(element, path);
  return value !== null && value !== undefined;
}

export function resolveDiscriminatorPath(
  element: any,
  _path: string,
  resolver: ReferenceResolverFn,
): any | null {
  const refString = typeof element === 'object' && element?.reference
    ? element.reference
    : typeof element === 'string' ? element : null;
  if (!refString || !resolver) return null;
  try { return resolver(refString) ?? null; } catch { return null; }
}
