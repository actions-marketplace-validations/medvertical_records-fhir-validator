import type { StructureDefinition } from './structure-definition-types';
import type { PackageDownloader } from '../package/package-downloader.js';
import type { PackageRegistryClient } from '../package/package-registry-client.js';
import type { ProfileSourcesConfig } from '../types';
import { normalizeProfileSourcesConfig } from '@records-fhir/validation-types';
import { logger } from '../logger';
import { loadFromLocalCache } from './sd-loader-filesystem';
import { isPackageAllowed } from './sd-loader-package-config';

export interface AutoDownloadContext {
  registryClient: PackageRegistryClient;
  packageDownloader: PackageDownloader;
  allowedPackages: string[];
  packageVersionPins?: Record<string, string>;
  packageSources: string[];
  cache: Map<string, StructureDefinition>;
  availableProfiles: Set<string>;
  /** Profile sources settings (optional - defaults to all enabled) */
  profileSourcesConfig?: ProfileSourcesConfig;
  /** FHIR version for package filtering (defaults to R4) */
  fhirVersion?: 'R4' | 'R5' | 'R6';
}

function isCoreFhirStructureDefinition(url: string): boolean {
  return url.startsWith('http://hl7.org/fhir/StructureDefinition/') &&
    !url.includes('/us/') &&
    !url.includes('/uv/') &&
    !url.includes('/extensions/');
}

function fhirVersionFamily(sd: StructureDefinition): 'R4' | 'R5' | 'R6' | null {
  const sdFhirVersion = (sd as { fhirVersion?: string }).fhirVersion;
  if (!sdFhirVersion) return null;
  if (sdFhirVersion.startsWith('4.')) return 'R4';
  if (sdFhirVersion.startsWith('5.')) return 'R5';
  if (sdFhirVersion.startsWith('6.')) return 'R6';
  return null;
}

function matchesRequestedFhirVersion(sd: StructureDefinition, requested: 'R4' | 'R5' | 'R6'): boolean {
  const family = fhirVersionFamily(sd);
  return !family || family === requested;
}

function urlFhirVersionFamily(url: string): 'R4' | 'R5' | 'R6' | null {
  const match = url.match(/\/fhir\/([456])\.0(?:\.\d+)?\/StructureDefinition\//);
  if (!match) return null;
  if (match[1] === '4') return 'R4';
  if (match[1] === '5') return 'R5';
  if (match[1] === '6') return 'R6';
  return null;
}

function urlMatchesRequestedFhirVersion(url: string, requested: 'R4' | 'R5' | 'R6'): boolean {
  const family = urlFhirVersionFamily(url);
  return !family || family === requested;
}

function cacheDownloadedProfile(url: string, sd: StructureDefinition, context: AutoDownloadContext): void {
  const requested = context.fhirVersion || 'R4';
  const family = fhirVersionFamily(sd) ?? requested;
  context.cache.set(`${url}:${family}`, sd);
  context.availableProfiles.add(url);
}

// ============================================================================
// Request Deduplication and Negative Caching
// ============================================================================

/** In-flight requests to prevent duplicate parallel fetches */
const pendingRequests = new Map<string, Promise<StructureDefinition | null>>();

/** Negative cache for profiles that weren't found (TTL: 30 minutes - long enough for batch validation runs) */
const NOT_FOUND_CACHE_TTL_MS = 30 * 60 * 1000;
const notFoundCache = new Map<string, number>(); // url -> timestamp
const scopeNotFoundCache = new Map<string, number>(); // conservative generic canonical scope -> timestamp

interface AutoDownloadAttemptResult {
  profile: StructureDefinition | null;
  /**
   * True only when the resolver failed before finding any package candidate.
   * This lets generic vendor hosts short-circuit subsequent sibling canonicals
   * without suppressing namespaces where the registry did find a package.
   */
  scopeMiss: boolean;
}

/**
 * Clear negative cache for a specific URL (for testing or manual refresh)
 */
export function clearNotFoundCacheEntry(url: string): void {
  notFoundCache.delete(url);
  const scope = getGenericCanonicalScope(url);
  if (scope) scopeNotFoundCache.delete(scope);
}

/**
 * Clear all caches (for testing)
 */
export function clearAllCaches(): void {
  pendingRequests.clear();
  notFoundCache.clear();
  scopeNotFoundCache.clear();
}

/**
 * Attempt to auto-download a package for a profile URL
 * Implements request deduplication and negative caching to improve performance
 */
export async function attemptAutoDownload(
  url: string,
  context: AutoDownloadContext
): Promise<StructureDefinition | null> {
  const genericScope = getGenericCanonicalScope(url);
  if (genericScope) {
    const notFoundTimestamp = scopeNotFoundCache.get(genericScope);
    if (notFoundTimestamp && Date.now() - notFoundTimestamp < NOT_FOUND_CACHE_TTL_MS) {
      logger.debug(`[SDLoader] Skipping ${url} - generic scope ${genericScope} cached as not-found`);
      notFoundCache.set(url, Date.now());
      return null;
    }
  }

  // 1. Check negative cache first - skip profiles we already know don't exist
  const notFoundTimestamp = notFoundCache.get(url);
  if (notFoundTimestamp && Date.now() - notFoundTimestamp < NOT_FOUND_CACHE_TTL_MS) {
    logger.debug(`[SDLoader] Skipping ${url} - cached as not-found`);
    return null;
  }

  // 2. Deduplicate in-flight requests - wait for existing request instead of duplicating
  const pending = pendingRequests.get(url);
  if (pending) {
    logger.debug(`[SDLoader] Waiting for pending request: ${url}`);
    return pending;
  }

  // 3. Execute actual download
  const promise = executeAutoDownload(url, context).then(result => {
    if (result.profile === null && result.scopeMiss && genericScope) {
      scopeNotFoundCache.set(genericScope, Date.now());
    }
    return result.profile;
  });
  pendingRequests.set(url, promise);

  try {
    const result = await promise;

    // 4. Cache negative result to avoid repeated lookups
    if (result === null) {
      notFoundCache.set(url, Date.now());
    }

    return result;
  } finally {
    pendingRequests.delete(url);
  }
}

/**
 * Internal implementation of auto-download logic
 * Tries sources based on profileSourcesConfig settings
 */
async function executeAutoDownload(
  url: string,
  context: AutoDownloadContext
): Promise<AutoDownloadAttemptResult> {
  const requestedFhirVersion = context.fhirVersion || 'R4';
  if (!urlMatchesRequestedFhirVersion(url, requestedFhirVersion)) {
    logger.info(`[SDLoader] Skipping auto-download for FHIR-version-incompatible profile URL: ${url} (${requestedFhirVersion})`);
    return { profile: null, scopeMiss: false };
  }

  const config = normalizeProfileSourcesConfig(context.profileSourcesConfig);
  logger.info(`[SDLoader] Profile not found locally, trying remote sources for: ${url}`);
  logger.debug(`[SDLoader] Enabled sources: Simplifier=${config.simplifier}, Registry=${config.packageRegistry}`);
  let sawPackageCandidate = false;

  try {
    // Wrap auto-download in a timeout to prevent indefinite hangs
    const result = await Promise.race([
      (async () => {
        // Step 1: Try the embedder's external-fetch fallback (server
        // wires Simplifier.net here; standalone callers skip).
        if (config.simplifier) {
          try {
            const { getProfileSource } = await import('../persistence/index.js');
            const fetchExternal = getProfileSource().fetchExternalProfile;
            if (fetchExternal) {
              logger.info(`[SDLoader] Trying external-fetch fallback for: ${url}`);
              const sd = await fetchExternal(url);
              if (sd) {
                if (!matchesRequestedFhirVersion(sd, requestedFhirVersion)) {
                  logger.warn(`[SDLoader] Ignoring external profile with mismatched fhirVersion: ${url}`);
                } else {
                  cacheDownloadedProfile(url, sd as StructureDefinition, context);
                  logger.info(`[SDLoader] ✅ Profile fetched via external fallback: ${url}`);
                  return { profile: sd as StructureDefinition, scopeMiss: false };
                }
              }
              logger.debug(`[SDLoader] Profile not found via external fallback`);
            }
          } catch (simplifierError: any) {
            logger.debug(`[SDLoader] External-fetch fallback failed:`, simplifierError.message);
          }
        }

        // Step 2: Try package registry if enabled
        if (config.packageRegistry) {
          const packageId = await context.registryClient.detectPackageForProfile(url);
          sawPackageCandidate = !!packageId;
          if (packageId && isPackageAllowed(packageId, context.allowedPackages)) {
            const requestedCanonicalVersion = getCanonicalVersion(url);
            const pinnedVersion = context.packageVersionPins?.[packageId];
            const packageVersion = pinnedVersion ?? requestedCanonicalVersion;
            logger.info(`[SDLoader] Detected package: ${packageId}${packageVersion ? `#${packageVersion}` : ''}`);

            const downloadResult = await context.packageDownloader.downloadAndInstall(packageId, packageVersion);

            if (downloadResult.success) {
              logger.info(`[SDLoader] ✅ Package downloaded: ${packageId}#${downloadResult.version}`);

              const sd = await loadFromLocalCache(url, context.packageSources, context.fhirVersion || 'R4');

              if (sd) {
                cacheDownloadedProfile(url, sd, context);
                logger.info(`[SDLoader] ✅ Profile loaded from package: ${url}`);
                return { profile: sd, scopeMiss: false };
              }
              logger.warn(`[SDLoader] Profile still not found after downloading package: ${url}`);
            } else {
              logger.warn(`[SDLoader] Failed to download package ${packageId}: ${downloadResult.error}`);
            }
          } else if (!packageId) {
            logger.debug(`[SDLoader] Package not found in registry for: ${url}`);
          } else {
            logger.warn(`[SDLoader] Package ${packageId} is not in allowed list`);
          }
        }

        return { profile: null, scopeMiss: !sawPackageCandidate };
      })(),
      new Promise<AutoDownloadAttemptResult>((_, reject) =>
        setTimeout(() => reject(new Error('Auto-download timeout after 20s')), 20000)
      )
    ]);

    return result;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn(`[SDLoader] Auto-download failed or timed out for ${url}:`, err.message);
    return { profile: null, scopeMiss: false };
  }
}

function getCanonicalVersion(url: string): string | undefined {
  const separatorIndex = url.indexOf('|');
  if (separatorIndex < 0) return undefined;
  const version = url.slice(separatorIndex + 1).trim();
  return version.length > 0 ? version : undefined;
}

function getGenericCanonicalScope(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const normalized = url.toLowerCase();

    if (host === 'hl7.org' ||
      host === 'hl7.eu' ||
      host.endsWith('.hl7.org.uk') ||
      host === 'hl7.org.au' ||
      host === 'fhir.de' ||
      host.endsWith('.fhir.de') ||
      host === 'gematik.de' ||
      host.endsWith('.gematik.de') ||
      host === 'fhir.kbv.de' ||
      host === 'profiles.ihe.net' ||
      host === 'nictiz.nl' ||
      host.endsWith('.nictiz.nl') ||
      host === 'fhir.org') {
      return null;
    }

    if (normalized.includes('medizininformatik') ||
      normalized.includes('mii') ||
      normalized.includes('fhir.uk') ||
      normalized.includes('who.anc-cds')) {
      return null;
    }

    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if a profile URL is public (eligible for auto-download)
 * 
 * Returns true for any https:// URL - these can be fetched via Simplifier or direct HTTP.
 * Returns false for internal/urn:uuid: style URLs.
 */
export function isPublicProfile(url: string): boolean {
  // Any HTTP/HTTPS URL is considered public and can be fetched
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true;
  }

  // Local/internal URLs are not public
  return false;
}
