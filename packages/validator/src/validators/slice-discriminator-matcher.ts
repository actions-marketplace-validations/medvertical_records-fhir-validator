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
import {
  canPatternCoreIdentifyCodingSlice,
  matchExistsDiscriminator,
  matchWholeElementChildConstraints,
  resolvedResourceMatchesSliceTargetProfile,
  resolveDiscriminatorPath,
} from './slice-discriminator-complex-matchers';

export type { ReferenceResolverFn } from './slice-profile-discriminator-matcher';

/**
 * Whether a slice carries enough resolved metadata to evaluate a
 * discriminator. Differential-only snapshots can retain the slicing header
 * while losing the inherited fixed/pattern/type constraints from their base
 * profile. Treating such a slice as a match (or a mismatch) creates resource
 * errors from a profile-resolution gap.
 */
export function sliceHasDiscriminatorEvidence(
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
): boolean {
  const path = normalizeDiscriminatorPath(discriminator.path);
  const childPath = normalizeChildConstraintPath(path);

  // Some generated snapshots retain a max=0 placeholder slice with an empty
  // pattern at `$this`. Java renders its discriminator as `$this.empty()`:
  // it is deterministically incapable of matching an actual array item. Do
  // not treat the empty object as a wildcard pattern, and do not classify it
  // as missing inherited metadata either.
  if (isProhibitedEmptyWholeElementSlice(slice, discriminator.type, path)) {
    return true;
  }

  if (discriminator.type === 'type') {
    return getTypeSpecsForDiscriminator(slice, path).length > 0;
  }
  if (discriminator.type === 'profile') {
    return getTypeSpecsForDiscriminator(slice, path).some(spec =>
      (spec.profile?.length ?? 0) > 0 || (spec.targetProfile?.length ?? 0) > 0
    );
  }
  if (discriminator.type === 'exists') {
    return candidateChildConstraintPaths(childPath).some(candidatePath =>
      slice.childMin?.has(candidatePath) ||
      slice.childFixed?.has(candidatePath) ||
      slice.childPatterns?.has(candidatePath)
    );
  }
  if (path === 'url' && getExtensionProfileUrls(slice).length > 0) return true;
  return hasDirectDiscriminatorEvidence(slice, path);
}

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
  if (isProhibitedEmptyWholeElementSlice(slice, 'value', path)) return false;
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
      const childFixed = getChildConstraint(slice.childFixed, childPath);
      if (childFixed !== undefined) return valuesMatch(elementValue, childFixed);
    }
    if (slice.childPatterns) {
      const childPattern = getChildConstraint(slice.childPatterns, childPath);
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
  if (isProhibitedEmptyWholeElementSlice(slice, 'pattern', path)) return false;
  const elementValue = getValueAtPath(element, path);
  const childPath = normalizeChildConstraintPath(path);

  if ((!path || path === '$this') && !slice.pattern && !slice.fixed) {
    const childConstraintMatch = matchWholeElementChildConstraints(elementValue, slice, matchesPatternFn);
    if (childConstraintMatch === false) return false;
  }

  if (path && path !== '$this') {
    if (slice.childPatterns) {
      const childPattern = getChildConstraint(slice.childPatterns, childPath);
      if (childPattern !== undefined) return matchesPatternFn(elementValue, childPattern);
    }
    if (slice.childFixed) {
      const childFixed = getChildConstraint(slice.childFixed, childPath);
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
    if (slice.childFixed && getChildConstraint(slice.childFixed, candidatePath) !== undefined) return true;
    if (slice.childPatterns && getChildConstraint(slice.childPatterns, candidatePath) !== undefined) return true;
    if (slice.childBindingCodes?.has(candidatePath)) return true;
    if (slice.childBindingValueSets?.has(candidatePath)) return true;
  }

  if (slice.fixed && getValueAtPath(slice.fixed, path) !== undefined) return true;
  if (slice.pattern && getValueAtPath(slice.pattern, path) !== undefined) return true;
  if ((slice.bindingCodes?.size ?? 0) > 0) return true;
  return Boolean(slice.bindingValueSet);
}

function isProhibitedEmptyWholeElementSlice(
  slice: SliceDefinition,
  discriminatorType: string,
  path: string,
): boolean {
  if (slice.max !== '0') return false;
  if (discriminatorType !== 'pattern' && discriminatorType !== 'value') return false;
  if (path && path !== '$this') return false;

  return !hasMeaningfulConstraintValue(slice.pattern) &&
    !hasMeaningfulConstraintValue(slice.fixed) &&
    (slice.childPatterns?.size ?? 0) === 0 &&
    (slice.childFixed?.size ?? 0) === 0 &&
    (slice.bindingCodes?.size ?? 0) === 0 &&
    !slice.bindingValueSet;
}

function hasMeaningfulConstraintValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/**
 * A discriminator on a parent slice may be constrained inside a nested child
 * slice. For example, the core blood-pressure profile discriminates
 * `Observation.component` by `code.coding.code` while the fixed value lives at
 * `code.coding:SBPCode.code`. StructureDefinition slice labels are not
 * instance path segments, so compare an alias with those labels removed.
 *
 * Only return an aliased value when it is unambiguous. A parent containing two
 * child slices with different fixed values cannot be identified from that
 * discriminator alone.
 */
function getChildConstraint(map: Map<string, any>, requestedPath: string): any | undefined {
  if (map.has(requestedPath)) return map.get(requestedPath);

  const matches = Array.from(map.entries())
    .filter(([candidatePath]) => stripSliceLabels(candidatePath) === requestedPath)
    .map(([, value]) => value);
  if (matches.length === 0) return undefined;

  const first = matches[0];
  return matches.every(value => valuesMatch(value, first)) ? first : undefined;
}

function stripSliceLabels(path: string): string {
  return path
    .split('.')
    .map(segment => segment.split(':')[0])
    .join('.');
}
