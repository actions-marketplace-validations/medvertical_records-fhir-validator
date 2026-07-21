/** Loads and caches FHIR StructureDefinitions from bundled, local, and remote sources. */

import { PackageDownloader } from '../package/package-downloader.js';
import { PackageRegistryClient, packageRegistryClient } from '../package/package-registry-client.js';
import { logger } from '../logger';
import type { StructureDefinition } from './structure-definition-types';
import type { ProfileSourcesConfig, ValidationSettings } from '../types';
import type { ProfileSourceContext } from '../persistence';
import { normalizeProfileSourcesConfig } from '@records-fhir/validation-types';
import { isRelevantPackage as _isRelevantPackage } from './sd-loader-filesystem';
import { parseAllowedPackages, isPackageAllowed as _isPackageAllowed } from './sd-loader-package-config';
import {
  cacheKeyForProfile,
  fhirVersionFamily,
} from './sd-loader-version-utils';
import { resolveDefaultBundledProfilesPath } from './sd-loader-bundled-path';
import { sanitizeProfile } from './sd-loader-profile-sanitizer';
import { loadIGPackageIntoAvailableProfiles } from './sd-loader-ig-package';
import { loadProfilesBatchWithCache } from './sd-loader-batch-loader';
import { scanProfileSources, warmUpProfilesFromDatabase } from './sd-loader-initialization';
import { loadProfile, type LoadProfileContext } from './sd-loader-load';
export { normalizeKnownStructureDefinitionCanonicalUrl } from './sd-loader-version-utils';

export type {
  StructureDefinition,
  ElementDefinition,
  ElementType,
  Constraint,
  Binding
} from './structure-definition-types';

export class StructureDefinitionLoader {
  private cachePath: string;
  private bundledPath: string | null;
  private cache: Map<string, StructureDefinition> = new Map();
  private availableProfiles: Set<string> = new Set();
  private packageSources: string[] = [];
  private packageDownloader: PackageDownloader;
  private registryClient: PackageRegistryClient;
  private autoDownload: boolean;
  private profileSourcesConfig: ProfileSourcesConfig;
  private allowedPackages: string[];
  private packageVersionPins: Record<string, string>;
  private initializationPromise: Promise<void>;
  private dbCacheNotFound: Set<string> = new Set(); // Negative cache for DB lookups
  private profileNotFound: Set<string> = new Set(); // Negative cache for full loadProfile misses
  private profileLoadPromises = new Map<string, Promise<StructureDefinition | null>>();
  private initializationComplete: boolean = false; // Guard against re-initialization
  private pinnedCanonicals: Map<string, string> | null = null; // url → url|version
  private readonly maxCacheEntries: number;
  // External registrations have no durable reload source. The cache budget
  // therefore applies only to entries the loader can reconstruct.
  private readonly externalProfileCacheKeys = new Set<string>();
  private profileSourceContext?: ProfileSourceContext;
  private profileResolutionSettings?: ValidationSettings;

  constructor(
    cachePath: string,
    bundledPath?: string | null,
    options?: {
      autoDownload?: boolean;
      profileSourcesConfig?: ProfileSourcesConfig;
      allowedPackages?: string[];
      packageVersionPins?: Record<string, string>;
      packageDownloader?: PackageDownloader;
      registryClient?: PackageRegistryClient;
      maxCacheEntries?: number;
    }
  ) {
    this.cachePath = cachePath;
    this.bundledPath = bundledPath ?? resolveDefaultBundledProfilesPath();
    this.autoDownload = options?.autoDownload ?? (process.env.FHIR_AUTO_DOWNLOAD_PACKAGES === 'true');
    this.profileSourcesConfig = normalizeProfileSourcesConfig(options?.profileSourcesConfig);
    this.allowedPackages = options?.allowedPackages ?? parseAllowedPackages();
    this.registryClient = options?.registryClient ?? packageRegistryClient;
    this.packageVersionPins = { ...(options?.packageVersionPins ?? {}) };
    this.packageDownloader = options?.packageDownloader ?? new PackageDownloader(this.cachePath, this.registryClient);
    this.maxCacheEntries = Math.max(1, Math.trunc(options?.maxCacheEntries ?? 192));

    this.packageSources = [
      ...(this.bundledPath ? [this.bundledPath] : []),
      this.cachePath
    ];

    logger.info(`[SDLoader] Package sources: ${this.packageSources.join(', ')}`);
    logger.info(`[SDLoader] Auto-download: ${this.autoDownload ? 'enabled' : 'disabled'}`);
    if (this.autoDownload) {
      logger.debug(`[SDLoader] Allowed packages: ${this.allowedPackages.join(', ')}`);
    }

    this.initializationPromise = this.initializeCache();
  }

  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Set pinned canonical map from the package resolver. When set,
   * loadProfile() resolves unversioned URLs to their pinned version
   * before looking up caches, eliminating runtime ambiguity.
   */
  setPinnedCanonicals(pinned: Map<string, string>): void {
    this.pinnedCanonicals = pinned;
    logger.info(`[SDLoader] Pinned ${pinned.size} canonical(s) — runtime resolution is now deterministic`);
  }

  getPinnedCanonicalCount(): number {
    return this.pinnedCanonicals?.size ?? 0;
  }

  private async initializeCache(): Promise<void> {
    if (this.initializationComplete) {
      logger.debug('[SDLoader] Already initialized, skipping');
      return;
    }

    const startTime = Date.now();

    try {
      await scanProfileSources({
        packageSources: this.packageSources,
        availableProfiles: this.availableProfiles,
        packageVersionPins: this.packageVersionPins,
      });

      await warmUpProfilesFromDatabase({
        cache: this.cache,
        availableProfiles: this.availableProfiles,
      });
      this.pruneProfileCache();

      const elapsed = Date.now() - startTime;
      logger.info(`[SDLoader] ✅ Initialization complete in ${elapsed}ms (bundled: ${this.availableProfiles.size}, cached: ${this.cache.size})`);

      this.initializationComplete = true;

    } catch (error) {
      logger.warn('[SDLoader] Error initializing cache:', error);
    }
  }

  /**
   * Load multiple StructureDefinitions in batch (optimized)
   * This is 3-5x faster than calling loadProfile() repeatedly
   */
  async loadProfilesBatch(
    urls: string[],
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
  ): Promise<Map<string, StructureDefinition>> {
    if (this.profileSourceContext?.organizationId !== undefined) {
      const scopedProfiles = new Map<string, StructureDefinition>();
      await Promise.all(urls.map(async url => {
        const profile = await this.loadProfile(url, fhirVersion);
        if (profile) scopedProfiles.set(url, profile);
      }));
      return scopedProfiles;
    }
    const profiles = await loadProfilesBatchWithCache({
      urls,
      fhirVersion,
      cache: this.cache,
      resolvePinnedCanonical: url => this.resolvePinnedCanonical(url),
      loadProfile: (url, version) => this.loadProfile(url, version),
    });
    this.pruneProfileCache();
    return profiles;
  }

  /**
   * Bind subsequent profile loads to the current validation request. Scoped
   * validator instances make this stable for the duration of a tenant run.
   */
  setProfileResolutionContext(
    context?: ProfileSourceContext,
    settings?: ValidationSettings,
  ): void {
    this.profileSourceContext = context;
    this.profileResolutionSettings = settings;
  }

  getProfileResolutionContext(): ProfileSourceContext | undefined {
    return this.profileSourceContext
      ? { ...this.profileSourceContext }
      : undefined;
  }

  loadProfile(
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
  ): Promise<StructureDefinition | null> {
    return loadProfile(this.loadContext(), url, fhirVersion).finally(() => {
      this.pruneProfileCache();
    });
  }

  private pruneProfileCache(): void {
    while (this.cache.size > this.maxCacheEntries) {
      const oldestEvictableKey = this.oldestEvictableCacheKey();
      if (oldestEvictableKey === undefined) break;
      this.cache.delete(oldestEvictableKey);
    }
  }

  private oldestEvictableCacheKey(): string | undefined {
    for (const cacheKey of this.cache.keys()) {
      if (!this.externalProfileCacheKeys.has(cacheKey)) return cacheKey;
    }
    return undefined;
  }

  private loadContext(): LoadProfileContext {
    return {
      availableProfiles: this.availableProfiles,
      packageSources: this.packageSources,
      cache: this.cache,
      profileNotFound: this.profileNotFound,
      dbCacheNotFound: this.dbCacheNotFound,
      profileLoadPromises: this.profileLoadPromises,
      autoDownload: this.autoDownload,
      registryClient: this.registryClient,
      packageDownloader: this.packageDownloader,
      allowedPackages: this.allowedPackages,
      packageVersionPins: this.packageVersionPins,
      profileSourcesConfig: this.profileSourcesConfig,
      profileSourceContext: this.profileSourceContext,
      profileResolutionSettings: this.profileResolutionSettings,
      resolvePinnedCanonical: (candidateUrl: string) => this.resolvePinnedCanonical(candidateUrl),
    };
  }

  async hasBaseProfiles(): Promise<boolean> {
    const baseProfiles = [
      'http://hl7.org/fhir/StructureDefinition/Patient',
      'http://hl7.org/fhir/StructureDefinition/Observation',
    ];

    for (const profileUrl of baseProfiles) {
      if (this.availableProfiles.has(profileUrl)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Synchronously resolve a profile canonical URL to its base FHIR resource type
   * (e.g. "http://fhir.de/StructureDefinition/ISiKPatient" → "Patient").
   * Returns null if the profile is not in the in-memory cache.
   */
  getBaseResourceType(canonicalUrl: string): string | null {
    // Try version-specific keys first (R4, R5), then bare URL
    for (const suffix of [':R4', ':R5', '']) {
      const sd = this.cache.get(canonicalUrl + suffix);
      if (sd?.type) return sd.type;
    }
    return null;
  }

  isProfileAvailable(url: string): boolean {
    return this.availableProfiles.has(url) || this.cache.has(url);
  }

  getAvailableProfiles(): string[] {
    return Array.from(this.availableProfiles);
  }

  async loadIGPackage(
    packageId: string,
    version?: string
  ): Promise<void> {
    return loadIGPackageIntoAvailableProfiles(this.cachePath, this.availableProfiles, packageId, version);
  }

  setAutoDownload(enabled: boolean): void {
    this.autoDownload = enabled;
    logger.info(`[SDLoader] Auto-download ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update which remote sources are allowed for profile resolution.
   */
  setProfileSourcesConfig(config: ProfileSourcesConfig): void {
    this.profileSourcesConfig = normalizeProfileSourcesConfig(config);
    logger.info(
      `[SDLoader] Profile sources updated: ` +
      `Simplifier=${this.profileSourcesConfig.simplifier}, Registry=${this.profileSourcesConfig.packageRegistry}`
    );
  }

  getProfileSourcesConfig(): ProfileSourcesConfig {
    return { ...this.profileSourcesConfig };
  }

  isAutoDownloadEnabled(): boolean {
    return this.autoDownload;
  }

  setAllowedPackages(packages: string[]): void {
    this.allowedPackages = packages;
    logger.info(`[SDLoader] Allowed packages updated: ${packages.join(', ')}`);
  }

  getAllowedPackages(): string[] {
    return [...this.allowedPackages];
  }

  /**
   * Pin package versions used by auto-download.
   */
  setPackageVersionPins(pins: Record<string, string>): void {
    this.packageVersionPins = { ...pins };
    logger.info(`[SDLoader] Package version pins updated: ${Object.keys(pins).length} package(s)`);
  }

  getPackageVersionPins(): Record<string, string> {
    return { ...this.packageVersionPins };
  }

  /**
   * Cache a profile from external source (e.g., FHIR client)
   * This ensures profiles loaded from the FHIR server are reused in subsequent validation runs
   */
  cacheProfile(url: string, profile: StructureDefinition, fhirVersion?: 'R4' | 'R5' | 'R6'): void {
    if (!profile || !url) return;

    const family = fhirVersionFamily(profile) ?? fhirVersion ?? 'R4';
    const cacheKey = cacheKeyForProfile(url, family);
    this.cache.set(cacheKey, profile);
    this.externalProfileCacheKeys.add(cacheKey);
    this.availableProfiles.add(url);
    this.profileNotFound.delete(cacheKey);
    this.profileLoadPromises.delete(cacheKey);
    logger.debug(`[SDLoader] Externally cached profile: ${url} (${family})`);
  }

  private resolvePinnedCanonical(url: string): string {
    if (this.pinnedCanonicals && !url.includes('|')) {
      const pinned = this.pinnedCanonicals.get(url);
      if (pinned) {
        logger.debug(`[SDLoader] Pinned: ${url} → ${pinned}`);
        return pinned;
      }
    }
    return url;
  }

  /**
   * Register an external StructureDefinition with the loader.
   *
   * Unlike cacheProfile(), this method caches using the same version-specific
   * cache key format that loadProfile() uses (`${url}:${fhirVersion}`), so the
   * registered profile is actually discoverable by the main validation path.
   *
   * Used by:
   * - Conformance test harness (case-runner) to preload supporting profiles
   * - External callers that want to inject a profile without filesystem/download
   */
  registerExternalProfile(
    sd: StructureDefinition,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
  ): boolean {
    if (!sd || !sd.url) {
      logger.warn('[SDLoader] registerExternalProfile: SD has no url, skipping');
      return false;
    }

    const sanitized = sanitizeProfile(sd);
    const cacheKey = `${sd.url}:${fhirVersion}`;

    this.cache.set(cacheKey, sanitized);
    this.externalProfileCacheKeys.add(cacheKey);
    this.availableProfiles.add(sd.url);
    this.dbCacheNotFound.delete(sd.url);
    this.dbCacheNotFound.delete(cacheKey);
    this.profileNotFound.delete(cacheKey);
    this.profileLoadPromises.delete(cacheKey);

    logger.debug(`[SDLoader] Registered external profile: ${sd.url} (${fhirVersion})`);
    return true;
  }

  clearCache(): void {
    this.cache.clear();
    this.externalProfileCacheKeys.clear();
    this.profileNotFound.clear();
    this.profileLoadPromises.clear();
    logger.info('[SDLoader] Cache cleared');
  }

}
