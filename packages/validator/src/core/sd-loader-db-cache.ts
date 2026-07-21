/**
 * StructureDefinition Loader - Embedder-Provided Profile Source
 *
 * Forwards profile-by-URL lookups to whatever ProfileSource the embedder
 * installed via `setProfileSource()`. Default = noop (returns null), so
 * the engine works fine in standalone (CLI / npm-package) contexts where
 * no database-backed source is available.
 *
 * Historically this file lazy-imported the server's `ProfileCache`
 * directly; that coupling now lives at `persistence/index.ts` where
 * embedders inject their implementation.
 */

import type { StructureDefinition } from './structure-definition-types';
import { logger } from '../logger';
import { getProfileSource, type ProfileSourceContext } from '../persistence';

function matchesFhirVersion(sd: StructureDefinition, fhirVersion: 'R4' | 'R5' | 'R6'): boolean {
  const sdFhirVersion = (sd as { fhirVersion?: string }).fhirVersion;
  if (!sdFhirVersion) return true;

  const expectedPrefix = fhirVersion === 'R4' ? '4.' : fhirVersion === 'R5' ? '5.' : '6.';
  return sdFhirVersion.startsWith(expectedPrefix);
}

function requestedCanonicalVersion(url: string): string | undefined {
  const [, version] = url.split('|');
  return version || undefined;
}

function matchesExplicitCanonicalVersion(sd: StructureDefinition, url: string): boolean {
  const requestedVersion = requestedCanonicalVersion(url);
  if (!requestedVersion) return true;

  const sdVersion = (sd as { version?: string }).version;
  return sdVersion === requestedVersion;
}

/**
 * Look up a profile in the embedder-provided ProfileSource.
 * @param url - Profile canonical URL
 * @param dbCacheNotFound - Negative cache set
 * @param fhirVersion - FHIR version to filter by (prevents R5 defs being returned for R4 validation)
 */
export async function checkDatabaseCache(
  url: string,
  dbCacheNotFound: Set<string>,
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
  context?: ProfileSourceContext,
): Promise<StructureDefinition | null> {
  // Create a version-specific cache key for negative cache
  const scopeSuffix = context?.organizationId !== undefined
    ? `:org:${context.organizationId}:server:${context.serverId ?? 'any'}`
    : '';
  const cacheKey = `${url}:${fhirVersion}${scopeSuffix}`;

  // Skip lookup if we already know it's not there (negative cache)
  if (dbCacheNotFound.has(cacheKey)) {
    logger.debug(`[SDLoader] Skipping ProfileSource check for ${cacheKey} (known not found)`);
    return null;
  }

  const source = getProfileSource();
  if (!source.findByUrl) {
    return null;
  }

  logger.debug(`[SDLoader] Checking ProfileSource for: ${url} (${fhirVersion})`);
  try {
    const sd = await source.findByUrl(url, fhirVersion, context);
    if (sd) {
      if (!matchesFhirVersion(sd, fhirVersion)) {
        logger.debug(`[SDLoader] Found in ProfileSource but wrong FHIR version for ${url}`);
        dbCacheNotFound.add(cacheKey);
        return null;
      }
      if (!matchesExplicitCanonicalVersion(sd, url)) {
        logger.debug(`[SDLoader] Found in ProfileSource but wrong canonical version for ${url}`);
        dbCacheNotFound.add(cacheKey);
        return null;
      }
      logger.debug(`[SDLoader] ✅ Found in ProfileSource: ${url}`);
      return sd;
    }

    logger.debug(`[SDLoader] Not found in ProfileSource`);
    dbCacheNotFound.add(cacheKey);
    return null;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.debug(`[SDLoader] ProfileSource lookup failed:`, err.message);
    // Don't negative-cache errors — might be transient.
    return null;
  }
}
