import type { StructureDefinition, ElementDefinition } from './structure-definition-types';
import { StructureDefinitionLoader } from './structure-definition-loader';
import { logger } from '../logger';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { SnapshotCache } from './snapshot-cache';
import { SnapshotElementMerger } from './snapshot-element-merger';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';

export interface SnapshotGenerationOptions {
  includeBaseElements?: boolean;
  applyConstraints?: boolean;
  cacheResults?: boolean;
}

export class SnapshotGenerator {
  private sdLoader: StructureDefinitionLoader;
  private readonly snapshotCache: SnapshotCache;
  private readonly elementMerger = new SnapshotElementMerger();

  constructor(sdLoader: StructureDefinitionLoader, maxCacheEntries: number = 192) {
    this.sdLoader = sdLoader;
    this.snapshotCache = new SnapshotCache(maxCacheEntries);
  }

  async generateSnapshot(
    profileSD: StructureDefinition,
    options: SnapshotGenerationOptions = {}
  ): Promise<ElementDefinition[]> {
    try {
      if (profileSD.snapshot && profileSD.snapshot.element && profileSD.snapshot.element.length > 0) {
        logger.debug('[SnapshotGenerator] Snapshot already exists', profileCanonicalMetadata(profileSD.url));
        return profileSD.snapshot.element;
      }

      const cachedSnapshot = this.snapshotCache.get(profileSD);
      if (options.cacheResults !== false && cachedSnapshot) {
        logger.debug('[SnapshotGenerator] Using cached snapshot', profileCanonicalMetadata(profileSD.url));
        return cachedSnapshot;
      }

      logger.info('[SnapshotGenerator] Generating snapshot', profileCanonicalMetadata(profileSD.url));

      const baseProfile = await this.loadBaseProfile(profileSD.baseDefinition);

      if (!baseProfile) {
        logger.warn('[SnapshotGenerator] No base profile found; using differential', profileCanonicalMetadata(profileSD.url));
        return profileSD.differential?.element || [];
      }

      let baseSnapshot = baseProfile.snapshot?.element || [];

      if (baseSnapshot.length === 0 && baseProfile.differential) {
        baseSnapshot = await this.generateSnapshot(baseProfile, options);
      }

      const snapshot = this.elementMerger.merge(
        baseSnapshot,
        profileSD.differential?.element || [],
        options.applyConstraints !== false,
      );

      if (options.cacheResults !== false) {
        this.snapshotCache.set(profileSD, snapshot);
      }

      logger.info('[SnapshotGenerator] Snapshot generated', {
        ...profileCanonicalMetadata(profileSD.url),
        elementCount: snapshot.length,
      });
      return snapshot;

    } catch (error: unknown) {
      logger.error(
        '[SnapshotGenerator] Snapshot generation failed',
        validationFailureMetadata(error),
      );
      return profileSD.differential?.element || [];
    }
  }

  private async loadBaseProfile(baseUrl?: string): Promise<StructureDefinition | null> {
    if (!baseUrl) {
      return null;
    }

    try {
      logger.debug('[SnapshotGenerator] Loading base profile', profileCanonicalMetadata(baseUrl));
      const baseProfile = await this.sdLoader.loadProfile(baseUrl);
      return baseProfile;
    } catch (error: unknown) {
      logger.warn(
        '[SnapshotGenerator] Base profile load failed',
        validationFailureMetadata(error),
      );
      return null;
    }
  }

  clearCache(): void {
    this.snapshotCache.clear();
    logger.debug('[SnapshotGenerator] Cache cleared');
  }

  evict(profileUrl: string): boolean {
    return this.snapshotCache.evict(profileUrl);
  }

  getCacheStats(): { size: number; profiles: string[] } {
    return this.snapshotCache.stats();
  }
}
