import type { SlicingDiscriminator } from '../core/structure-definition-types';
import type { SliceDefinition } from './slice-types';
import { getValueAtPath, matchesPattern } from './slice-utils';

type DiscriminatorMatcher = (
  element: any,
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
) => boolean;

export function isRelaxedCodingIdentityCardinalityMatch(
  element: any,
  slice: SliceDefinition,
  discriminators: SlicingDiscriminator[],
  matchDiscriminator: DiscriminatorMatcher,
): boolean {
  for (const discriminator of discriminators) {
    if (!matchDiscriminator(element, slice, discriminator)) {
      return false;
    }

    if (isCodingIdentityRelaxedPatternMatch(element, slice, discriminator)) {
      return true;
    }
  }

  return false;
}

function isCodingIdentityRelaxedPatternMatch(
  element: any,
  slice: SliceDefinition,
  discriminator: SlicingDiscriminator,
): boolean {
  if (discriminator.type !== 'pattern') return false;
  if (discriminator.path && discriminator.path !== '$this') return false;
  if (slice.patternKind !== 'patternCoding' || slice.pattern === undefined) return false;

  const elementValue = getValueAtPath(element, discriminator.path);
  if (matchesPattern(elementValue, slice.pattern)) return false;

  return codingIdentityMatchesPattern(elementValue, slice.pattern);
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
