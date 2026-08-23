import type { SlicingDiscriminator } from '../core/structure-definition-types';
import { logger } from '../logger';
import type { SliceDefinition } from './slice-types';
import {
  matchExistsDiscriminator,
  resolvedResourceMatchesSliceTargetProfile,
  resolveDiscriminatorPath,
} from './slice-discriminator-complex-matchers';
import {
  hasDirectDiscriminatorEvidence,
  normalizeDiscriminatorPath,
} from './slice-discriminator-constraints';
import {
  matchProfileDiscriminator,
  profileListContains,
  toProfileArray,
  type ReferenceResolverFn,
} from './slice-profile-discriminator-matcher';
import { matchResolvedTypeDiscriminator, matchTypeDiscriminator } from './slice-type-discriminator';
import { matchPatternDiscriminator, matchValueDiscriminator } from './slice-discriminator-value-matchers';

export type { ReferenceResolverFn } from './slice-profile-discriminator-matcher';
export { sliceHasDiscriminatorEvidence } from './slice-discriminator-constraints';

export function matchDiscriminator(
  element: unknown,
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
  referenceResolver: ReferenceResolverFn,
  matchesPattern: (value: unknown, pattern: unknown) => boolean,
  matchesBinding: (value: unknown, codes: Set<string>) => boolean,
  allSlices?: SliceDefinition[],
): boolean {
  const path = normalizeDiscriminatorPath(discriminator.path);
  if (path.startsWith('resolve()')) {
    return matchResolvedDiscriminator(
      element,
      slice,
      discriminator,
      path,
      referenceResolver,
      matchesPattern,
      matchesBinding,
      allSlices,
    );
  }
  switch (discriminator.type) {
    case 'value': return matchValueDiscriminator(element, slice, path, matchesPattern, matchesBinding);
    case 'pattern': return matchPatternDiscriminator(element, slice, path, matchesPattern, matchesBinding, allSlices);
    case 'type': return matchTypeDiscriminator(element, slice, path);
    case 'profile': return matchProfileDiscriminator(element, slice, path, referenceResolver, allSlices, matchesPattern);
    case 'exists': return matchExistsDiscriminator(element, path);
    default:
      logger.warn(`[SlicingValidator] Unsupported discriminator type: ${discriminator.type}`);
      return false;
  }
}

function matchResolvedDiscriminator(
  element: unknown,
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
  path: string,
  referenceResolver: ReferenceResolverFn,
  matchesPattern: (value: unknown, pattern: unknown) => boolean,
  matchesBinding: (value: unknown, codes: Set<string>) => boolean,
  allSlices?: SliceDefinition[],
): boolean {
  const resolved = resolveDiscriminatorPath(element, path, referenceResolver);
  if (resolved === null) return false;
  const remainder = path.slice('resolve()'.length).replace(/^\./, '');
  if (discriminator.type === 'type') return matchResolvedTypeDiscriminator(resolved, slice, remainder, allSlices);
  if (discriminator.type === 'profile') {
    return matchProfileDiscriminator(resolved, slice, remainder || '$this', referenceResolver, allSlices, matchesPattern);
  }
  if (discriminator.type === 'exists') return matchExistsDiscriminator(resolved, remainder || '$this');
  const ofType = remainder.match(/^ofType\(([^)]+)\)$/);
  if (ofType) return isRecord(resolved) && resolved.resourceType === ofType[1];
  const conformsTo = remainder.match(/^conformsTo\('([^']+)'\)$/);
  if (conformsTo) {
    const meta = isRecord(resolved) && isRecord(resolved.meta) ? resolved.meta : null;
    return profileListContains(toProfileArray(meta?.profile), conformsTo[1]);
  }
  const directMatch = discriminator.type === 'pattern'
    ? matchPatternDiscriminator(resolved, slice, remainder || '$this', matchesPattern, matchesBinding, allSlices)
    : matchValueDiscriminator(resolved, slice, remainder || '$this', matchesPattern, matchesBinding);
  return directMatch
    || (!hasDirectDiscriminatorEvidence(slice, remainder)
      && resolvedResourceMatchesSliceTargetProfile(resolved, slice));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
