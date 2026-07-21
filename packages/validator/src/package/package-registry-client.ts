/**
 * FHIR Package Registry API Client
 * 
 * Communicates with packages.fhir.org to fetch package metadata and download tarballs.
 * 
 * API Endpoints:
 * - List versions: GET https://packages.fhir.org/<packageId>
 * - Download: GET https://packages.fhir.org/<packageId>/<version>
 * - Search by canonical: GET https://packages.fhir.org?canonical=<url>
 */

import { logger } from '../logger';
import { detectPackageForProfile } from './package-profile-detector';
import {
  isAllowedPackageTarballUrl,
  packageErrorMetadata,
  packageReferenceMetadata,
  isSafePackageId,
  isSafePackageVersion,
  resolvePackageSizeLimit,
} from './package-artifact-policy.js';
import { isPackageManifestFor, readResponseBodyBounded } from './package-registry-response.js';
import type { PackageInfo, PackageManifest } from './package-registry-types.js';
import { PackageManifestCache } from './package-manifest-cache.js';
import { resolvePackageManifestVersion } from './package-manifest-version.js';
export type { PackageInfo, PackageManifest, PackageVersion } from './package-registry-types.js';

// ============================================================================
// Types
// ============================================================================

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

// ============================================================================
// Package Registry Client
// ============================================================================

export class PackageRegistryClient {
  private fhirRegistryUrl: string = 'https://packages.fhir.org';
  private simplifierUrl: string = 'https://packages.simplifier.net';
  private timeout: number;
  private manifestCache: PackageManifestCache;

  constructor(
    timeout: number = 10000,  // Reduced from 30s to 10s to prevent hangs
    maxCacheEntries: number = 128
  ) {
    this.timeout = timeout;
    this.manifestCache = new PackageManifestCache(maxCacheEntries);
  }

  /**
   * Fetch package manifest (list of versions)
   * Tries Simplifier.net first for UK Core packages, then FHIR registry
   */
  async fetchPackageManifest(packageId: string): Promise<PackageManifest | null> {
    if (!isSafePackageId(packageId)) return null;
    try {
      // Check cache first
      const cached = this.manifestCache.get(packageId);
      if (cached) {
        logger.info('[PackageRegistry] Using cached manifest', packageReferenceMetadata(packageId));
        return cached;
      }

      // Determine which registry to try first based on package ID
      const shouldTrySimplifierFirst = this.shouldUseSimplifier(packageId);

      let manifest: PackageManifest | null = null;

      if (shouldTrySimplifierFirst) {
        // Try Simplifier first
        logger.info('[PackageRegistry] Trying Simplifier registry', packageReferenceMetadata(packageId));
        manifest = await this.fetchFromRegistry(packageId, this.simplifierUrl);

        if (!manifest) {
          // Fall back to FHIR registry
          logger.info('[PackageRegistry] Simplifier lookup failed; trying FHIR registry', packageReferenceMetadata(packageId));
          manifest = await this.fetchFromRegistry(packageId, this.fhirRegistryUrl);
        }
      } else {
        // Try FHIR registry first
        logger.info('[PackageRegistry] Trying FHIR registry', packageReferenceMetadata(packageId));
        manifest = await this.fetchFromRegistry(packageId, this.fhirRegistryUrl);

        if (!manifest) {
          // Fall back to Simplifier
          logger.info('[PackageRegistry] FHIR lookup failed; trying Simplifier registry', packageReferenceMetadata(packageId));
          manifest = await this.fetchFromRegistry(packageId, this.simplifierUrl);
        }
      }

      if (manifest) {
        this.manifestCache.set(packageId, manifest);
        logger.info('[PackageRegistry] Package manifest resolved', {
          ...packageReferenceMetadata(packageId),
          versionCount: Object.keys(manifest.versions).length,
        });
      } else {
        logger.warn('[PackageRegistry] Package not found in any registry', packageReferenceMetadata(packageId));
      }

      return manifest;

    } catch (error: unknown) {
      logger.error('[PackageRegistry] Manifest resolution failed', {
        ...packageReferenceMetadata(packageId),
        ...packageErrorMetadata(error),
      });
      return null;
    }
  }

  /**
   * Fetch from a specific registry URL
   */
  private async fetchFromRegistry(packageId: string, registryUrl: string): Promise<PackageManifest | null> {
    const startTime = Date.now();
    const url = `${registryUrl}/${encodeURIComponent(packageId)}`;

    try {
      logger.info('[PackageRegistry] Fetching package manifest', {
        ...packageReferenceMetadata(packageId),
        registry: this.registryName(registryUrl),
        timeoutMs: this.timeout,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Records-FHIR-Validator/1.0'
          }
        });

        const fetchTime = Date.now() - startTime;

        if (!response.ok) {
          if (response.status === 404) {
            logger.info('[PackageRegistry] Registry returned package not found', {
              ...packageReferenceMetadata(packageId),
              registry: this.registryName(registryUrl),
              status: 404,
              durationMs: fetchTime,
            });
            return null;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const manifestBuffer = await readResponseBodyBounded(response, MAX_MANIFEST_BYTES);
        if (!manifestBuffer) {
          logger.warn('[PackageRegistry] Registry manifest exceeds size limit');
          return null;
        }
        const manifest = JSON.parse(manifestBuffer.toString('utf8')) as unknown;
        if (!isPackageManifestFor(manifest, packageId)) {
          logger.warn('[PackageRegistry] Registry returned an invalid package manifest');
          return null;
        }
        const totalTime = Date.now() - startTime;
        logger.info('[PackageRegistry] Package manifest fetched', {
          ...packageReferenceMetadata(packageId),
          registry: this.registryName(registryUrl),
          durationMs: totalTime,
        });
        return manifest;
      } finally {
        clearTimeout(timeoutId);
      }

    } catch (error: unknown) {
      const totalTime = Date.now() - startTime;
      logger.warn('[PackageRegistry] Package manifest request failed', {
        ...packageReferenceMetadata(packageId),
        registry: this.registryName(registryUrl),
        durationMs: totalTime,
        ...packageErrorMetadata(error),
      });
      return null;
    }
  }

  /**
   * Determine if package should try Simplifier.net first
   */
  private shouldUseSimplifier(packageId: string): boolean {
    // UK Core packages are on Simplifier (uk.core.r4.v2, etc.)
    if (packageId.includes('uk.core') || packageId.includes('nhsdigital') ||
      packageId.includes('hl7.fhir.uk')) {
      return true;
    }

    // Some German packages prefer Simplifier
    if (packageId.includes('de.gematik') || packageId.includes('kbv')) {
      return true;
    }

    // Default: try FHIR registry first
    return false;
  }

  /**
   * Get package info for a specific version (or latest)
   */
  async getPackageInfo(packageId: string, version?: string): Promise<PackageInfo | null> {
    if (!isSafePackageId(packageId) || (version !== undefined && !isSafePackageVersion(version))) {
      return null;
    }
    try {
      const manifest = await this.fetchPackageManifest(packageId);
      if (!manifest) {
        return null;
      }

      // Determine version to use. Some published canonicals use short
      // SemVer (for example `|2.7`) while the package registry publishes the
      // package as `2.7.0`.
      const targetVersion = resolvePackageManifestVersion(manifest, version);
      if (!targetVersion) {
        logger.warn('[PackageRegistry] Package manifest has no usable version', packageReferenceMetadata(packageId));
        return null;
      }

      const versionInfo = manifest.versions[targetVersion];
      if (
        !versionInfo
        || !isSafePackageVersion(targetVersion)
        || versionInfo.name !== packageId
        || versionInfo.version !== targetVersion
        || typeof versionInfo.dist?.tarball !== 'string'
      ) {
        logger.warn('[PackageRegistry] Requested package version is unavailable', packageReferenceMetadata(packageId, targetVersion));
        return null;
      }

      return {
        packageId,
        version: targetVersion,
        tarballUrl: versionInfo.dist.tarball,
        fhirVersion: versionInfo.fhirVersion
      };

    } catch (error: unknown) {
      logger.error('[PackageRegistry] Package metadata lookup failed', {
        ...packageReferenceMetadata(packageId, version),
        ...packageErrorMetadata(error),
      });
      return null;
    }
  }

  /**
   * Download package tarball
   */
  async downloadPackageTarball(
    packageId: string,
    version: string,
    maxBytes = 500 * 1024 * 1024,
  ): Promise<Buffer | null> {
    const safeMaxBytes = resolvePackageSizeLimit(maxBytes);
    if (!isSafePackageId(packageId) || !isSafePackageVersion(version) || safeMaxBytes === null) return null;
    try {
      const packageInfo = await this.getPackageInfo(packageId, version);
      if (!packageInfo) {
        return null;
      }

      if (!isAllowedPackageTarballUrl(packageInfo.tarballUrl)) {
        logger.warn('[PackageRegistry] Refusing untrusted package tarball URL', packageReferenceMetadata(packageId, version));
        return null;
      }

      logger.info('[PackageRegistry] Downloading package tarball', packageReferenceMetadata(packageId, version));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(packageInfo.tarballUrl, {
          signal: controller.signal,
          redirect: 'error',
          headers: {
            'User-Agent': 'Records-FHIR-Validator/1.0'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > safeMaxBytes) {
          logger.warn('[PackageRegistry] Package tarball exceeds download limit', {
            ...packageReferenceMetadata(packageId, version),
            declaredBytes: declaredLength,
            maxBytes: safeMaxBytes,
          });
          return null;
        }

        const buffer = await readResponseBodyBounded(response, safeMaxBytes);
        if (!buffer) {
          logger.warn('[PackageRegistry] Package tarball exceeded streaming limit', {
            ...packageReferenceMetadata(packageId, version),
            maxBytes: safeMaxBytes,
          });
          return null;
        }
        logger.info('[PackageRegistry] Package tarball downloaded', {
          ...packageReferenceMetadata(packageId, version),
          bytes: buffer.length,
        });

        return buffer;
      } finally {
        clearTimeout(timeoutId);
      }

    } catch (error: unknown) {
      logger.error('[PackageRegistry] Package tarball download failed', {
        ...packageReferenceMetadata(packageId, version),
        ...packageErrorMetadata(error),
      });
      return null;
    }
  }

  /**
   * Detect package ID from profile URL
   * First tries known patterns, then falls back to generic ProfilePackageMapper
   */
  async detectPackageForProfile(profileUrl: string): Promise<string | null> {
    return detectPackageForProfile(profileUrl);
  }

  private registryName(registryUrl: string): 'fhir' | 'simplifier' | 'unknown' {
    if (registryUrl === this.fhirRegistryUrl) return 'fhir';
    if (registryUrl === this.simplifierUrl) return 'simplifier';
    return 'unknown';
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.manifestCache.clear();
    logger.info('[PackageRegistry] Cache cleared');
  }

  getCacheStats(): {
    size: number;
    maxSize: number;
    packageIds: string[];
    hits: number;
    misses: number;
    evictions: number;
    staleEvictions: number;
  } {
    return this.manifestCache.getStats();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const packageRegistryClient = new PackageRegistryClient();
