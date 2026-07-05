import type { SliceDefinition } from './slice-types';
import {
  getValueAtPath,
  inferType,
} from './slice-utils';

export function matchResolvedTypeDiscriminator(
  resolvedElement: any,
  slice: SliceDefinition,
  remainder: string,
  allSlices?: SliceDefinition[],
): boolean {
  if (!resolvedElement || typeof resolvedElement !== 'object') return false;

  if (remainder) {
    const ofTypeMatch = remainder.match(/^ofType\(([^)]+)\)$/);
    if (ofTypeMatch) return resolvedElement.resourceType === ofTypeMatch[1];
  }

  const typeSpecs = getTypeSpecsForDiscriminator(slice, '$this');
  if (typeSpecs.length === 0) return false;

  const targetProfiles = typeSpecs.flatMap(spec => spec.targetProfile ?? []);
  if (targetProfiles.length > 0) {
    const profiles = toProfileArray(resolvedElement.meta?.profile);
    if (profiles.some(profile => profileListContains(targetProfiles, profile))) return true;

    const allowedTargetTypes = new Set(targetProfiles.map(profileToResourceType).filter(Boolean));
    if (
      typeof resolvedElement.resourceType === 'string' &&
      allowedTargetTypes.has(resolvedElement.resourceType) &&
      targetProfilesAreDistinguishing(slice, allSlices)
    ) {
      return true;
    }
  }

  const allowedTypeCodes = typeSpecs.map(spec => spec.code).filter(Boolean);
  return typeof resolvedElement.resourceType === 'string' &&
    allowedTypeCodes.includes(resolvedElement.resourceType);
}

export function matchTypeDiscriminator(element: any, slice: SliceDefinition, path: string): boolean {
  const value = getValueAtPath(element, path);
  if (value === null || value === undefined) return false;

  const valueType = inferType(value);
  const typeSpecs = getTypeSpecsForDiscriminator(slice, path);

  return typeSpecs.some(t => typeCodeMatchesValue(t.code, valueType, value));
}

export function getTypeSpecsForDiscriminator(
  slice: SliceDefinition,
  path: string,
): Array<{ code: string; profile?: string[]; targetProfile?: string[] }> {
  // In real snapshots, sliced BackboneElements often carry the generic root
  // type on the slice itself while the discriminator-specific type/profile is
  // defined on a child, e.g. Bundle.entry:composition.resource. For
  // discriminator path "resource", that child constraint is authoritative.
  if (slice.childTypes && path && path !== '$this') {
    const childSpecs = slice.childTypes.get(path);
    if (childSpecs && childSpecs.length > 0) return childSpecs;
  }
  return slice.type ?? [];
}

export function stripCanonicalVersion(profile: string): string {
  return profile.split('|')[0] ?? profile;
}

function typeCodeMatchesValue(expectedType: string | undefined, inferredType: string, value: any): boolean {
  if (!expectedType) return false;
  if (expectedType === inferredType) return true;

  if (value && typeof value === 'object' && typeof value.resourceType === 'string') {
    return expectedType === value.resourceType;
  }

  if (expectedType === 'CodeableConcept' && isCodeableConceptLike(value)) {
    return true;
  }
  if (expectedType === 'Coding' && isCodingLike(value)) {
    return true;
  }

  if (isExtensionOnlyObject(value) && !PRIMITIVE_TYPE_CODES.has(expectedType)) {
    return true;
  }

  if (typeof value !== 'string') return false;
  switch (expectedType) {
    case 'date':
      return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
    case 'dateTime':
      return /^\d{4}(-\d{2}(-\d{2}(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?)?)?)?$/.test(value);
    case 'instant':
      return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value);
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?$/.test(value);
    case 'string':
    case 'code':
    case 'markdown':
    case 'id':
    case 'uri':
    case 'url':
    case 'canonical':
    case 'oid':
    case 'uuid':
      return inferredType === 'string';
    default:
      return false;
  }
}

function targetProfilesAreDistinguishing(
  currentSlice: SliceDefinition,
  allSlices?: SliceDefinition[],
): boolean {
  if (!allSlices || allSlices.length <= 1) return false;

  const currentProfiles = collectTargetProfiles(currentSlice);
  if (currentProfiles.size === 0) return false;

  for (const otherSlice of allSlices) {
    if (otherSlice.sliceName === currentSlice.sliceName) continue;
    const otherProfiles = collectTargetProfiles(otherSlice);
    if (otherProfiles.size === 0) continue;
    for (const profile of currentProfiles) {
      if (otherProfiles.has(profile)) return false;
    }
  }

  return true;
}

function collectTargetProfiles(slice: SliceDefinition): Set<string> {
  const profiles = new Set<string>();
  for (const spec of getTypeSpecsForDiscriminator(slice, '$this')) {
    for (const profile of spec.targetProfile ?? []) profiles.add(stripCanonicalVersion(profile));
  }
  return profiles;
}

function profileToResourceType(profileUrl: string): string | null {
  const clean = stripCanonicalVersion(profileUrl);
  const tail = clean.split('/').pop();
  if (!tail) return null;
  return tail.includes('-') ? null : tail;
}

function toProfileArray(profile: unknown): string[] {
  if (Array.isArray(profile)) return profile.filter((p): p is string => typeof p === 'string');
  if (typeof profile === 'string') return [profile];
  return [];
}

function profileListContains(profiles: string[], requestedProfile: string): boolean {
  return profiles.some(profile => profilesMatch(profile, requestedProfile));
}

function profilesMatch(left: string, right: string): boolean {
  return left === right || stripCanonicalVersion(left) === stripCanonicalVersion(right);
}

const PRIMITIVE_TYPE_CODES = new Set<string>([
  'string', 'code', 'markdown', 'id', 'uri', 'url', 'canonical', 'oid', 'uuid', 'xhtml',
  'integer', 'unsignedInt', 'positiveInt', 'integer64',
  'decimal', 'boolean',
  'date', 'dateTime', 'instant', 'time',
  'base64Binary',
]);

function isExtensionOnlyObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(k => k === 'extension' || k === 'id');
}

function isCodeableConceptLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.every(key => CODEABLE_CONCEPT_KEYS.has(key))) return false;
  return Array.isArray(value.coding) || typeof value.text === 'string';
}

function isCodingLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.every(key => CODING_KEYS.has(key))) return false;
  return ['system', 'version', 'code', 'display', 'userSelected'].some(key => key in value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CODEABLE_CONCEPT_KEYS = new Set(['id', 'extension', 'coding', 'text']);
const CODING_KEYS = new Set(['id', 'extension', 'system', 'version', 'code', 'display', 'userSelected']);
