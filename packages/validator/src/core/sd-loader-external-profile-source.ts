import { logger } from '../logger';
import { getProfileSource } from '../persistence';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import type { AutoDownloadSourceContext } from './sd-loader-auto-download-source-context';
import { cacheDownloadedProfile } from './sd-loader-downloaded-profile-cache';
import { profileMatchesCanonical } from './sd-loader-profile-identity';
import { matchesRequestedFhirVersion } from './sd-loader-version-utils';
import type { StructureDefinition } from './structure-definition-types';

/** Resolve a profile through the embedder-provided external source. */
export async function tryExternalProfileSource(
  url: string,
  context: AutoDownloadSourceContext,
  requestedFhirVersion: 'R4' | 'R5' | 'R6',
): Promise<StructureDefinition | null> {
  const fetchExternal = getProfileSource().fetchExternalProfile;
  if (!fetchExternal) return null;

  try {
    logger.info('[SDLoader] Trying external-fetch fallback', profileCanonicalMetadata(url));
    const profile = await settleWithin(fetchExternal(url), 20_000);
    if (!profile) return null;
    if (
      !profileMatchesCanonical(profile, url)
      || !matchesRequestedFhirVersion(profile, requestedFhirVersion)
    ) {
      logger.warn('[SDLoader] Ignoring mismatched external profile', profileCanonicalMetadata(url));
      return null;
    }
    logger.info('[SDLoader] Profile fetched via external fallback', profileCanonicalMetadata(url));
    return cacheDownloadedProfile(url, profile, context);
  } catch (error: unknown) {
    logger.debug(
      '[SDLoader] External-fetch fallback unavailable',
      validationFailureMetadata(error),
    );
    throw error;
  }
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('External profile lookup timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
