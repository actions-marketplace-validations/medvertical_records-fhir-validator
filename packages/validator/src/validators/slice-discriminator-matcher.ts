/**
 * Slice Discriminator Matcher
 *
 * Extracted from SlicingValidator. Handles the 5 discriminator types
 * (value, pattern, type, profile, exists) plus resolve() path support.
 */

import type { SlicingDiscriminator } from '../core/structure-definition-types';
import type { SliceDefinition } from './slice-types';
import {
  getValueAtPath,
  valueCanIdentifyFixedSlice,
  valuesMatch,
} from './slice-utils';
import { logger } from '../logger';
import {
  getTypeSpecsForDiscriminator,
  matchResolvedTypeDiscriminator,
  matchTypeDiscriminator,
  stripCanonicalVersion,
} from './slice-type-discriminator';
import {
  matchProfileDiscriminator,
  profileListContains,
  toProfileArray,
  type ReferenceResolverFn,
} from './slice-profile-discriminator-matcher';

export type { ReferenceResolverFn } from './slice-profile-discriminator-matcher';

export function matchDiscriminator(
  element: any,
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
  referenceResolver: ReferenceResolverFn,
  matchesPatternFn: (value: any, pattern: any) => boolean,
  codingMatchesBindingCodesFn: (value: any, codes: Set<string>) => boolean,
  allSlices?: SliceDefinition[],
): boolean {
  const path = normalizeDiscriminatorPath(discriminator.path);

  if (path.startsWith('resolve()')) {
    const resolvedElement = resolveDiscriminatorPath(element, path, referenceResolver);
    if (resolvedElement === null) return false;

    const remainder = path.slice('resolve()'.length).replace(/^\./, '');
    if (discriminator.type === 'type') {
      return matchResolvedTypeDiscriminator(resolvedElement, slice, remainder, allSlices);
    }
    if (remainder === '' || remainder === '$this') {
      return matchProfileDiscriminator(resolvedElement, slice, '$this', referenceResolver, allSlices);
    }
    const ofTypeMatch = remainder.match(/^ofType\(([^)]+)\)$/);
    if (ofTypeMatch) return resolvedElement?.resourceType === ofTypeMatch[1];
    const conformsToMatch = remainder.match(/^conformsTo\('([^']+)'\)$/);
    if (conformsToMatch) {
      return profileListContains(toProfileArray(resolvedElement?.meta?.profile), conformsToMatch[1]);
    }
    const directMatch = matchValueDiscriminator(resolvedElement, slice, remainder, matchesPatternFn, codingMatchesBindingCodesFn);
    if (directMatch) return true;

    if (!hasDirectDiscriminatorEvidence(slice, remainder)) {
      return resolvedResourceMatchesSliceTargetProfile(resolvedElement, slice);
    }

    return false;
  }

  switch (discriminator.type) {
    case 'value': return matchValueDiscriminator(element, slice, path, matchesPatternFn, codingMatchesBindingCodesFn);
    case 'pattern': return matchPatternDiscriminator(element, slice, path, matchesPatternFn, codingMatchesBindingCodesFn, allSlices);
    case 'type': return matchTypeDiscriminator(element, slice, path);
    case 'profile': return matchProfileDiscriminator(element, slice, path, referenceResolver, allSlices);
    case 'exists': return matchExistsDiscriminator(element, path);
    default:
      logger.warn(`[SlicingValidator] Unsupported discriminator type: ${discriminator.type}`);
      return false;
  }
}

function normalizeDiscriminatorPath(path: string): string {
  if (path.startsWith('$this.resolve()')) {
    return `resolve()${path.slice('$this.resolve()'.length)}`;
  }
  return path;
}

function matchValueDiscriminator(
  element: any,
  slice: SliceDefinition,
  path: string,
  matchesPatternFn: (value: any, pattern: any) => boolean,
  codingMatchesBindingCodesFn: (value: any, codes: Set<string>) => boolean,
): boolean {
  const elementValue = getValueAtPath(element, path);
  const childPath = normalizeChildConstraintPath(path);

  if (!path || path === '$this') {
    if (slice.fixed !== undefined) return valueCanIdentifyFixedSlice(elementValue, slice.fixed, slice.fixedKind);
    if (slice.pattern !== undefined) return matchesPatternFn(elementValue, slice.pattern);
    const childConstraintMatch = matchWholeElementChildConstraints(elementValue, slice, matchesPatternFn);
    if (childConstraintMatch !== null) return childConstraintMatch;
  }

  if (path && path !== '$this') {
    if (slice.childFixed) {
      const childFixed = slice.childFixed.get(childPath);
      if (childFixed !== undefined) return valuesMatch(elementValue, childFixed);
    }
    if (slice.childPatterns) {
      const childPattern = slice.childPatterns.get(childPath);
      if (childPattern !== undefined) return matchesPatternFn(elementValue, childPattern);
    }
    const childBindingMatch = matchChildBindingDiscriminator(
      slice,
      childPath,
      elementValue,
      codingMatchesBindingCodesFn,
    );
    if (childBindingMatch !== null) return childBindingMatch;

    if (path === 'url' && extensionProfileUrlMatches(elementValue, slice)) {
      return true;
    }
  }

  const sliceValue = slice.fixed ? getValueAtPath(slice.fixed, path) : null;
  if (sliceValue !== null && sliceValue !== undefined) return valuesMatch(elementValue, sliceValue);

  const patternValue = slice.pattern ? getValueAtPath(slice.pattern, path) : null;
  if (patternValue !== null && patternValue !== undefined) return matchesPatternFn(elementValue, patternValue);

  if (slice.bindingCodes && slice.bindingCodes.size > 0) {
    return codingMatchesBindingCodesFn(elementValue, slice.bindingCodes);
  }

  return false;
}

function extensionProfileUrlMatches(elementValue: any, slice: SliceDefinition): boolean {
  if (typeof elementValue !== 'string') return false;
  return getExtensionProfileUrls(slice).some(profileUrl => canonicalUrlBasesMatch(elementValue, profileUrl));
}

function getExtensionProfileUrls(slice: SliceDefinition): string[] {
  return (slice.type ?? [])
    .filter(typeSpec => typeSpec.code === 'Extension')
    .flatMap(typeSpec => typeSpec.profile ?? []);
}

function canonicalUrlBasesMatch(actual: string, expected: string): boolean {
  return stripCanonicalVersion(actual) === stripCanonicalVersion(expected);
}

function normalizeChildConstraintPath(path: string): string {
  return path.startsWith('$this.')
    ? path.slice('$this.'.length)
    : path;
}

function matchPatternDiscriminator(
  element: any, slice: SliceDefinition, path: string,
  matchesPatternFn: (value: any, pattern: any) => boolean,
  codingMatchesBindingCodesFn: (value: any, codes: Set<string>) => boolean,
  allSlices?: SliceDefinition[],
): boolean {
  const elementValue = getValueAtPath(element, path);
  const childPath = normalizeChildConstraintPath(path);

  if ((!path || path === '$this') && !slice.pattern && !slice.fixed) {
    const childConstraintMatch = matchWholeElementChildConstraints(elementValue, slice, matchesPatternFn);
    if (childConstraintMatch === false) return false;
  }

  if (path && path !== '$this') {
    if (slice.childPatterns) {
      const childPattern = slice.childPatterns.get(childPath);
      if (childPattern !== undefined) return matchesPatternFn(elementValue, childPattern);
    }
    if (slice.childFixed) {
      const childFixed = slice.childFixed.get(childPath);
      if (childFixed !== undefined) return matchesPatternFn(elementValue, childFixed);
    }
    const childBindingMatch = matchChildBindingDiscriminator(
      slice,
      childPath,
      elementValue,
      codingMatchesBindingCodesFn,
    );
    if (childBindingMatch !== null) return childBindingMatch;
  }

  if (slice.pattern) {
    const patternValue = (path === '$this' || !path) ? slice.pattern : getValueAtPath(slice.pattern, path);
    if (patternValue !== undefined && patternValue !== null) {
      if (matchesPatternFn(elementValue, patternValue)) return true;
      if (canPatternCoreIdentifyCodingSlice(elementValue, slice, patternValue, allSlices, matchesPatternFn)) {
        return true;
      }
      return false;
    }
  }

  if (slice.bindingCodes && slice.bindingCodes.size > 0) {
    return codingMatchesBindingCodesFn(elementValue, slice.bindingCodes);
  }

  return !slice.bindingValueSet;
}

function matchChildBindingDiscriminator(
  slice: SliceDefinition,
  childPath: string,
  elementValue: any,
  codingMatchesBindingCodesFn: (value: any, codes: Set<string>) => boolean,
): boolean | null {
  for (const path of candidateChildConstraintPaths(childPath)) {
    const childBindingCodes = slice.childBindingCodes?.get(path);
    if (childBindingCodes && childBindingCodes.size > 0) {
      return codingMatchesBindingCodesFn(elementValue, childBindingCodes);
    }
    if (slice.childBindingValueSets?.has(path)) return false;
  }
  return null;
}

function candidateChildConstraintPaths(childPath: string): string[] {
  const paths: string[] = [];
  let current = childPath;
  while (current) {
    paths.push(current);
    const dot = current.lastIndexOf('.');
    if (dot === -1) break;
    current = current.slice(0, dot);
  }
  return paths;
}

function hasDirectDiscriminatorEvidence(slice: SliceDefinition, path: string): boolean {
  const childPath = normalizeChildConstraintPath(path);
  for (const candidatePath of candidateChildConstraintPaths(childPath)) {
    if (slice.childFixed?.has(candidatePath)) return true;
    if (slice.childPatterns?.has(candidatePath)) return true;
    if (slice.childBindingCodes?.has(candidatePath)) return true;
    if (slice.childBindingValueSets?.has(candidatePath)) return true;
  }

  if (slice.fixed && getValueAtPath(slice.fixed, path) !== undefined) return true;
  if (slice.pattern && getValueAtPath(slice.pattern, path) !== undefined) return true;
  if ((slice.bindingCodes?.size ?? 0) > 0) return true;
  return Boolean(slice.bindingValueSet);
}

function resolvedResourceMatchesSliceTargetProfile(
  resolvedElement: any,
  slice: SliceDefinition,
): boolean {
  if (!resolvedElement || typeof resolvedElement !== 'object') return false;

  const targetProfiles = getTypeSpecsForDiscriminator(slice, '$this')
    .flatMap(spec => spec.targetProfile ?? []);
  if (targetProfiles.length === 0) return false;

  const profiles = toProfileArray(resolvedElement.meta?.profile);
  return profiles.some(profile => profileListContains(targetProfiles, profile));
}

function canPatternCoreIdentifyCodingSlice(
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
    codingIdentityMatchesPattern(elementValue, candidate.pattern),
  );

  if (matchingIdentitySlices.length !== 1 || matchingIdentitySlices[0] !== slice) {
    return false;
  }

  return !candidateSlices.some(candidate =>
    candidate !== slice &&
    candidate.pattern !== undefined &&
    matchesPatternFn(elementValue, candidate.pattern),
  );
}

function codingIdentityMatchesPattern(elementValue: any, patternValue: any): boolean {
  if (!isRecord(elementValue) || !isRecord(patternValue)) return false;
  if (typeof patternValue.system !== 'string' || typeof patternValue.code !== 'string') {
    return false;
  }
  return elementValue.system === patternValue.system && elementValue.code === patternValue.code;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchWholeElementChildConstraints(
  elementValue: any,
  slice: SliceDefinition,
  matchesPatternFn: (value: any, pattern: any) => boolean,
): boolean | null {
  let hasConstraint = false;

  if (slice.childPatterns) {
    for (const [childPath, childPattern] of slice.childPatterns) {
      hasConstraint = true;
      if (!matchesPatternFn(getValueAtPath(elementValue, childPath), childPattern)) {
        return false;
      }
    }
  }

  if (slice.childFixed) {
    for (const [childPath, childFixed] of slice.childFixed) {
      hasConstraint = true;
      if (!matchesPatternFn(getValueAtPath(elementValue, childPath), childFixed)) {
        return false;
      }
    }
  }

  return hasConstraint ? true : null;
}

function matchExistsDiscriminator(element: any, path: string): boolean {
  const value = getValueAtPath(element, path);
  return value !== null && value !== undefined;
}

function resolveDiscriminatorPath(element: any, _path: string, resolver: ReferenceResolverFn): any | null {
  const refString = typeof element === 'object' && element?.reference
    ? element.reference
    : typeof element === 'string' ? element : null;

  if (!refString || !resolver) return null;
  try { return resolver(refString) ?? null; } catch { return null; }
}
