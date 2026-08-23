import { sanitizeProfile } from './sd-loader-profile-sanitizer';
import type { StructureDefinition } from './structure-definition-types';
import {
  cacheKeyForProfile,
  fhirVersionFamily,
  type FhirVersionFamily,
} from './sd-loader-version-utils';

export function storeExternalProfile(params: {
  url: string;
  profile: StructureDefinition;
  fhirVersion?: FhirVersionFamily;
  cache: Map<string, StructureDefinition>;
  externalProfileCacheKeys: Set<string>;
  availableProfiles: Set<string>;
  profileLoadPromises: Map<string, Promise<StructureDefinition | null>>;
}): boolean {
  const {
    url,
    profile,
    fhirVersion,
    cache,
    externalProfileCacheKeys,
    availableProfiles,
    profileLoadPromises,
  } = params;
  if (!url || !profile?.url) return false;

  const sanitized = sanitizeProfile(profile);
  const family = fhirVersionFamily(sanitized) ?? fhirVersion ?? 'R4';
  const cacheKey = cacheKeyForProfile(url, family);
  cache.set(cacheKey, sanitized);
  externalProfileCacheKeys.add(cacheKey);
  availableProfiles.add(url);
  profileLoadPromises.delete(cacheKey);
  return true;
}
