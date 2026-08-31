import type { PackageManifest } from './package-registry-types.js';

interface CachedManifest {
  data: PackageManifest;
  timestamp: number;
}

export interface PackageManifestCacheStats {
  size: number;
  maxSize: number;
  packageIds: string[];
  hits: number;
  misses: number;
  evictions: number;
  staleEvictions: number;
}

export class PackageManifestCache {
  private readonly cache = new Map<string, CachedManifest>();
  private readonly maxCacheEntries: number;
  private readonly cacheTTL: number;
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEvictions = 0;
  private staleEvictions = 0;

  constructor(maxCacheEntries = 128, cacheTTL = 60 * 60 * 1000) {
    this.maxCacheEntries = normalizePositiveInteger(maxCacheEntries, 128, 4096);
    this.cacheTTL = normalizePositiveInteger(cacheTTL, 60 * 60 * 1000, 24 * 60 * 60 * 1000);
  }

  get(packageId: string): PackageManifest | null {
    const cached = this.cache.get(packageId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.cache.delete(packageId);
      this.cache.set(packageId, cached);
      this.cacheHits++;
      return structuredClone(cached.data);
    }

    if (cached) {
      this.cache.delete(packageId);
      this.staleEvictions++;
    }
    this.cacheMisses++;
    return null;
  }

  set(packageId: string, manifest: PackageManifest): void {
    this.cache.delete(packageId);
    while (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
      this.cacheEvictions++;
    }
    this.cache.set(packageId, { data: structuredClone(manifest), timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): PackageManifestCacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheEntries,
      packageIds: Array.from(this.cache.keys()),
      hits: this.cacheHits,
      misses: this.cacheMisses,
      evictions: this.cacheEvictions,
      staleEvictions: this.staleEvictions,
    };
  }
}

function normalizePositiveInteger(value: number, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}
