import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import type { StructureDefinition } from './structure-definition-types';
import { compareVersions } from './sd-loader-package-scanner';
import { matchesRequestedFhirVersion, type FhirVersionFamily } from './sd-loader-version-utils';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import { BoundedLruCache } from '../cache/bounded-lru-cache';

export type IndexedProfile = {
  sd: StructureDefinition;
  sourceName: string;
};

export type PackageProfileIndex = {
  byUrl: Map<string, IndexedProfile[]>;
  byVersionedUrl: Map<string, IndexedProfile>;
};

type CachedPackageProfileIndex = {
  signature: string;
  promise: Promise<PackageProfileIndex>;
};

type CachedPackageCanonicalIndex = {
  signature: string;
  promise: Promise<Set<string> | null>;
};

const MAX_PACKAGE_PROFILE_INDEX_ENTRIES = 256;
const MAX_PACKAGE_INDEX_BYTES = 8 * 1024 * 1024;

export class PackageProfileIndexCache {
  private readonly profileIndexes = new BoundedLruCache<string, CachedPackageProfileIndex>(
    MAX_PACKAGE_PROFILE_INDEX_ENTRIES,
  );
  private readonly canonicalIndexes = new BoundedLruCache<string, CachedPackageCanonicalIndex>(
    MAX_PACKAGE_PROFILE_INDEX_ENTRIES,
  );

  async mayContainCanonical(packagePath: string, targetUrl: string): Promise<boolean> {
    const indexPath = path.join(packagePath, '.index.json');
    let signature: string;
    try {
      const stats = await fs.stat(indexPath, { bigint: true });
      if (!stats.isFile() || stats.size > BigInt(MAX_PACKAGE_INDEX_BYTES)) return true;
      signature = `${stats.dev}:${stats.ino}:${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;
    } catch {
      return true;
    }

    let cached = this.canonicalIndexes.get(indexPath);
    if (cached?.signature !== signature) {
      cached = {
        signature,
        promise: loadCanonicalUrlsFromPackageIndex(indexPath),
      };
      this.canonicalIndexes.set(indexPath, cached);
    }

    const canonicalUrls = await cached.promise;
    return canonicalUrls?.has(targetUrl) ?? true;
  }

  async loadProfileIndex(
    packagePath: string,
    packageName: string,
    preferredResourceType: string,
  ): Promise<PackageProfileIndex> {
    const signature = await packageDirectorySignature(packagePath);
    const existing = this.profileIndexes.get(packagePath);
    if (existing?.signature === signature) return existing.promise;

    const entry: CachedPackageProfileIndex = {
      signature,
      promise: buildPackageProfileIndex(packagePath, packageName, preferredResourceType),
    };
    this.profileIndexes.set(packagePath, entry);

    try {
      return await entry.promise;
    } catch (error) {
      if (this.profileIndexes.get(packagePath) === entry) {
        this.profileIndexes.delete(packagePath);
      }
      throw error;
    }
  }

  clear(): void {
    this.profileIndexes.clear();
    this.canonicalIndexes.clear();
  }
}

/**
 * Use the standard FHIR package index as a cheap negative lookup. A missing,
 * oversized, or malformed index is treated as unknown so third-party package
 * layouts still fall back to the complete filesystem scan.
 */
export async function packageIndexMayContainCanonical(
  packagePath: string,
  targetUrl: string,
  indexCache: PackageProfileIndexCache = new PackageProfileIndexCache(),
): Promise<boolean> {
  return indexCache.mayContainCanonical(packagePath, targetUrl);
}

export async function loadPackageProfileIndex(
  packagePath: string,
  packageName: string,
  preferredResourceType: string,
  indexCache: PackageProfileIndexCache = new PackageProfileIndexCache(),
): Promise<PackageProfileIndex> {
  return indexCache.loadProfileIndex(packagePath, packageName, preferredResourceType);
}

export function selectExactProfile(
  index: PackageProfileIndex,
  targetUrl: string,
  targetVersion: string | undefined,
  fhirVersion: FhirVersionFamily,
): IndexedProfile | null {
  if (targetVersion) {
    const exact = index.byVersionedUrl.get(`${targetUrl}|${targetVersion}`);
    if (exact && matchesRequestedFhirVersion(exact.sd, fhirVersion)) return exact;

    const candidates = index.byUrl.get(targetUrl) ?? [];
    return candidates.find(candidate =>
      typeof candidate.sd.version === 'string'
      && matchesRequestedFhirVersion(candidate.sd, fhirVersion)
      && canonicalVersionsAreEquivalent(targetVersion, candidate.sd.version)
    ) ?? null;
  }

  const candidates = index.byUrl.get(targetUrl) ?? [];
  for (const candidate of candidates) {
    if (!matchesRequestedFhirVersion(candidate.sd, fhirVersion)) {
      logger.info(
        '[SDLoader] Skipping FHIR-version-incompatible profile',
        profileCanonicalMetadata(targetUrl, candidate.sd.version),
      );
      continue;
    }
    if (
      isPreReleaseVersion(candidate.sd.version)
      && !allowsUnversionedPreRelease(targetUrl, candidate, fhirVersion)
    ) {
      logger.info(
        '[SDLoader] Skipping pre-release profile for unversioned canonical',
        profileCanonicalMetadata(targetUrl, candidate.sd.version),
      );
      continue;
    }
    return candidate;
  }
  return null;
}

export function selectBetterUnversionedProfile(
  current: IndexedProfile | null,
  candidate: IndexedProfile,
  targetUrl: string,
  fhirVersion?: FhirVersionFamily,
): IndexedProfile | null {
  if (
    isPreReleaseVersion(candidate.sd.version)
    && !allowsUnversionedPreRelease(targetUrl, candidate, fhirVersion)
  ) {
    logger.info(
      '[SDLoader] Skipping pre-release profile for unversioned canonical',
      profileCanonicalMetadata(targetUrl, candidate.sd.version),
    );
    return current;
  }
  if (!current) return candidate;

  const candidateVersion = candidate.sd.version || '0.0.0';
  const currentVersion = current.sd.version || '0.0.0';
  return compareVersions(candidateVersion, currentVersion) > 0 ? candidate : current;
}

export function selectUnversionedCandidate(
  index: PackageProfileIndex,
  targetUrl: string,
  fhirVersion: FhirVersionFamily,
): IndexedProfile | null {
  const candidates = index.byUrl.get(targetUrl) ?? [];
  for (const candidate of candidates) {
    if (!matchesRequestedFhirVersion(candidate.sd, fhirVersion)) continue;
    if (
      !isPreReleaseVersion(candidate.sd.version)
      || allowsUnversionedPreRelease(targetUrl, candidate, fhirVersion)
    ) {
      return candidate;
    }
  }
  return null;
}

async function buildPackageProfileIndex(
  packagePath: string,
  packageName: string,
  preferredResourceType: string,
): Promise<PackageProfileIndex> {
  const index: PackageProfileIndex = {
    byUrl: new Map(),
    byVersionedUrl: new Map(),
  };
  const preferredFile = `StructureDefinition-${preferredResourceType}.json`;
  const jsonFiles = (await fs.readdir(packagePath))
    .filter(file => file.endsWith('.json'))
    .sort((left, right) => {
      if (left === preferredFile) return -1;
      if (right === preferredFile) return 1;
      return left.localeCompare(right);
    });

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(packagePath, file), 'utf-8');
      const profile = JSON.parse(content) as StructureDefinition;
      if (profile?.resourceType !== 'StructureDefinition' || typeof profile.url !== 'string') continue;

      const indexed: IndexedProfile = { sd: profile, sourceName: `${packageName}/${file}` };
      const candidates = index.byUrl.get(profile.url) ?? [];
      candidates.push(indexed);
      index.byUrl.set(profile.url, candidates);
      if (typeof profile.version === 'string' && profile.version.length > 0) {
        index.byVersionedUrl.set(`${profile.url}|${profile.version}`, indexed);
      }
    } catch {
      continue;
    }
  }
  return index;
}

async function packageDirectorySignature(packagePath: string): Promise<string> {
  const stats = await fs.stat(packagePath, { bigint: true });
  return `${stats.dev}:${stats.ino}:${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;
}

async function loadCanonicalUrlsFromPackageIndex(indexPath: string): Promise<Set<string> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8')) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return null;

    const urls = new Set<string>();
    for (const entry of parsed.files) {
      if (!entry || typeof entry !== 'object') continue;
      const resource = entry as { resourceType?: unknown; url?: unknown };
      if (resource.resourceType === 'StructureDefinition' && typeof resource.url === 'string') {
        urls.add(resource.url);
      }
    }
    return urls;
  } catch {
    return null;
  }
}

function canonicalVersionsAreEquivalent(requested: string, actual: string): boolean {
  if (requested === actual) return true;
  return normalizeShortSemverVersion(requested) === normalizeShortSemverVersion(actual);
}

function normalizeShortSemverVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)$/);
  return match ? `${match[1]}.${match[2]}.0` : version;
}

function isPreReleaseVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.includes('-');
}

function allowsUnversionedPreRelease(
  targetUrl: string,
  candidate: IndexedProfile,
  fhirVersion?: FhirVersionFamily,
): boolean {
  if (targetUrl.includes('hl7.eu/fhir/eps')) return true;
  return fhirVersion === 'R6'
    && /^https?:\/\/hl7\.org\/fhir\/StructureDefinition\//.test(targetUrl)
    && candidate.sourceName.toLowerCase().startsWith('hl7.fhir.r6.core#');
}
