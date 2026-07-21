import { promises as fs } from 'fs';
import * as path from 'path';
import type { StructureDefinition } from './structure-definition-types';
import { logger } from '../logger';
import { compareVersions } from './sd-loader-package-scanner';
import { matchesRequestedFhirVersion, type FhirVersionFamily } from './sd-loader-version-utils';

type IndexedProfile = {
  sd: StructureDefinition;
  sourceName: string;
};

type PackageProfileIndex = {
  byUrl: Map<string, IndexedProfile[]>;
  byVersionedUrl: Map<string, IndexedProfile>;
};

const packageProfileIndexCache = new Map<string, Promise<PackageProfileIndex>>();

function isPreReleaseVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.includes('-');
}

function allowsUnversionedPreRelease(targetUrl: string): boolean {
  return targetUrl.includes('hl7.eu/fhir/eps');
}

function hl7UvPackagePrefix(url: string): string | null {
  const match = url.toLowerCase().match(/^https?:\/\/hl7\.org\/fhir\/uv\/([^/]+)\//);
  return match ? `hl7.fhir.uv.${match[1]}` : null;
}

export function isRelevantPackage(
  packageName: string,
  url: string,
  fhirVersion: 'R4' | 'R5' | 'R6'
): boolean {
  const versionLower = fhirVersion.toLowerCase();

  if (packageName.includes('xver') || packageName.includes('extensions.r5')) {
    if (!packageName.startsWith(`hl7.fhir.uv.extensions.${versionLower}`)) {
      return false;
    }
  }

  if (url.includes('hl7.org/fhir/StructureDefinition/')) {
    return packageName.startsWith(`hl7.fhir.${versionLower}.core`) ||
      packageName.startsWith(`hl7.fhir.uv.extensions.${versionLower}`);
  }

  if (url.includes('hl7.org/fhir/us/core')) {
    return packageName.startsWith('hl7.fhir.us.core');
  }

  const uvPackagePrefix = hl7UvPackagePrefix(url);
  if (uvPackagePrefix) {
    return packageName.toLowerCase().startsWith(uvPackagePrefix);
  }

  if (url.includes('fhir.de') || url.includes('basisprofil')) {
    return packageName.startsWith('de.basisprofil') ||
      packageName.startsWith('de.einwilligungsmanagement');
  }

  if (url.includes('fhir.kbv.de')) {
    if (url.includes('KBV_') && url.includes('_EAU_')) {
      return packageName.startsWith('kbv.ita.eau');
    }
    if (url.includes('KBV_') && url.includes('_FOR_')) {
      return packageName.startsWith('kbv.ita.for');
    }
    return packageName.startsWith('kbv.');
  }

  if (url.includes('hl7.eu/fhir/eps')) {
    return packageName.startsWith('hl7.fhir.eu.eps');
  }

  if (url.includes('hl7.eu/fhir/base')) {
    return packageName.startsWith('hl7.fhir.eu.base');
  }

  if (url.includes('hl7.eu/fhir') || url.includes('hl7.eu/')) {
    return packageName.startsWith('hl7.fhir.eu.');
  }

  if (url.includes('profiles.ihe.net/PHARM/MPD')) {
    return packageName.startsWith('ihe.pharm.mpd.r4');
  }

  if (url.includes('gematik.de') && url.includes('/fhir/isip/')) {
    return packageName.startsWith('de.gematik.isip');
  }

  if (url.includes('gematik.de') && url.includes('/fhir/isik/')) {
    return packageName.startsWith('de.gematik.isik') || packageName.startsWith('de.gematik.isip');
  }

  if (url.includes('medizininformatikinitiative') || url.includes('medizininformatik-initiative') || url.includes('mii')) {
    return packageName.startsWith('de.medizininformatikinitiative');
  }

  if (url.includes('fhir.uk') || url.includes('uk.core') || url.includes('hl7.org.uk')) {
    return packageName.startsWith('UK.Core') ||
      packageName.startsWith('uk.core') ||
      packageName.startsWith('fhir.r4.ukcore') ||
      packageName.startsWith('uk.nhsdigital');
  }

  return true;
}

export async function loadFromLocalCache(
  url: string,
  packageSources: string[],
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
): Promise<StructureDefinition | null> {
  try {
    let targetUrl = url;
    let targetVersion: string | undefined;
    if (url.includes('|')) {
      const parts = url.split('|');
      targetUrl = parts[0];
      targetVersion = parts[1];
    }

    const resourceType = targetUrl.split('/').pop();
    if (!resourceType) return null;

    for (const source of packageSources) {
      try {
        const entries = await fs.readdir(source, { withFileTypes: true });
        let sourceMatch: IndexedProfile | null = null;

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          if (!isRelevantPackage(entry.name, targetUrl, fhirVersion)) {
            continue;
          }

          const packagePaths = [
            path.join(source, entry.name, 'package'),
            path.join(source, entry.name)
          ];

          for (const packagePath of packagePaths) {
            try {
              const index = await loadPackageProfileIndex(packagePath, entry.name, resourceType);
              const exact = selectExactProfile(index, targetUrl, targetVersion, fhirVersion);
              if (exact) {
                if (targetVersion) {
                  logger.debug(`[SDLoader] Loaded ${url} from ${exact.sourceName}`);
                  return exact.sd;
                }
                sourceMatch = selectBetterUnversionedProfile(sourceMatch, exact, targetUrl);
              }

              if (!targetVersion && !sourceMatch) {
                const candidate = selectUnversionedCandidate(index, targetUrl, fhirVersion);
                if (candidate) {
                  sourceMatch = candidate;
                }
              }
            } catch {
              continue;
            }
          }
        }

        if (sourceMatch) {
          logger.info(
            `[SDLoader] Loaded ${url} from ${sourceMatch.sourceName} ` +
            `(selected version ${sourceMatch.sd.version || 'unknown'})`
          );
          return sourceMatch.sd;
        }
      } catch {
        continue;
      }
    }

    if (targetVersion) {
      return null;
    }

    return null;
  } catch (error) {
    logger.error(`[SDLoader] Error loading from local cache:`, error);
    return null;
  }
}

async function loadPackageProfileIndex(
  packagePath: string,
  packageName: string,
  preferredResourceType: string
): Promise<PackageProfileIndex> {
  const cacheKey = packagePath;
  const existing = packageProfileIndexCache.get(cacheKey);
  if (existing) return existing;

  await fs.access(packagePath);
  const promise = buildPackageProfileIndex(packagePath, packageName, preferredResourceType);
  packageProfileIndexCache.set(cacheKey, promise);
  return promise;
}

async function buildPackageProfileIndex(
  packagePath: string,
  packageName: string,
  preferredResourceType: string
): Promise<PackageProfileIndex> {
  const index: PackageProfileIndex = {
    byUrl: new Map(),
    byVersionedUrl: new Map(),
  };

  const files = await fs.readdir(packagePath);
  const preferredFile = `StructureDefinition-${preferredResourceType}.json`;
  const jsonFiles = files
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => {
      if (a === preferredFile) return -1;
      if (b === preferredFile) return 1;
      return a.localeCompare(b);
    });

  for (const file of jsonFiles) {
    const filePath = path.join(packagePath, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const sd = JSON.parse(content) as StructureDefinition;
      if (sd?.resourceType !== 'StructureDefinition' || typeof sd.url !== 'string') {
        continue;
      }

      const indexed: IndexedProfile = { sd, sourceName: `${packageName}/${file}` };
      const candidates = index.byUrl.get(sd.url) ?? [];
      candidates.push(indexed);
      index.byUrl.set(sd.url, candidates);

      if (typeof sd.version === 'string' && sd.version.length > 0) {
        index.byVersionedUrl.set(`${sd.url}|${sd.version}`, indexed);
      }
    } catch {
      continue;
    }
  }

  return index;
}

function selectExactProfile(
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
      typeof candidate.sd.version === 'string' &&
      matchesRequestedFhirVersion(candidate.sd, fhirVersion) &&
      areCanonicalVersionsEquivalent(targetVersion, candidate.sd.version)
    ) ?? null;
  }

  const candidates = index.byUrl.get(targetUrl) ?? [];
  for (const candidate of candidates) {
    if (!matchesRequestedFhirVersion(candidate.sd, fhirVersion)) {
      logger.info(`[SDLoader] Skipping FHIR-version-incompatible profile ${targetUrl}@${candidate.sd.version} from ${candidate.sourceName}`);
      continue;
    }
    if (isPreReleaseVersion(candidate.sd.version) && !allowsUnversionedPreRelease(targetUrl)) {
      logger.info(`[SDLoader] Skipping pre-release profile ${targetUrl}@${candidate.sd.version} from ${candidate.sourceName}; unversioned canonicals must resolve to stable packages`);
      continue;
    }
    return candidate;
  }

  return null;
}

function areCanonicalVersionsEquivalent(requested: string, actual: string): boolean {
  if (requested === actual) return true;
  return normalizeShortSemverVersion(requested) === normalizeShortSemverVersion(actual);
}

function normalizeShortSemverVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)$/);
  if (!match) return version;
  return `${match[1]}.${match[2]}.0`;
}

function selectBetterUnversionedProfile(
  current: IndexedProfile | null,
  candidate: IndexedProfile,
  targetUrl: string
): IndexedProfile | null {
  if (isPreReleaseVersion(candidate.sd.version) && !allowsUnversionedPreRelease(targetUrl)) {
    logger.info(
      `[SDLoader] Skipping pre-release profile ${targetUrl}@${candidate.sd.version} ` +
      `from ${candidate.sourceName}; unversioned canonicals must resolve to stable packages`
    );
    return current;
  }

  if (!current) return candidate;

  const candidateVersion = candidate.sd.version || '0.0.0';
  const currentVersion = current.sd.version || '0.0.0';
  if (compareVersions(candidateVersion, currentVersion) > 0) {
    return candidate;
  }

  return current;
}

function selectUnversionedCandidate(
  index: PackageProfileIndex,
  targetUrl: string,
  fhirVersion: FhirVersionFamily,
): IndexedProfile | null {
  const candidates = index.byUrl.get(targetUrl) ?? [];
  for (const candidate of candidates) {
    if (!matchesRequestedFhirVersion(candidate.sd, fhirVersion)) continue;
    if (!isPreReleaseVersion(candidate.sd.version) || allowsUnversionedPreRelease(targetUrl)) {
      return candidate;
    }
  }
  return null;
}

export async function loadFromSource(
  sourcePath: string,
  url: string,
  resourceType: string,
  fhirVersion: 'R4' | 'R5' | 'R6'
): Promise<StructureDefinition | null> {
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageName = entry.name;
    const isRelevant = isRelevantPackage(packageName, url, fhirVersion);

    if (isRelevant) {
      const packagePath = path.join(sourcePath, packageName, 'package');

      try {
        const simpleFileName = `StructureDefinition-${resourceType}.json`;
        const simpleFilePath = path.join(packagePath, simpleFileName);

        try {
          const content = await fs.readFile(simpleFilePath, 'utf-8');
          const sd = JSON.parse(content) as StructureDefinition;
          if (sd.url === url) {
            return sd;
          }
        } catch {
        }

        const files = await fs.readdir(packagePath);
        for (const file of files) {
          if (!file.endsWith('.json')) {
            continue;
          }

          const filePath = path.join(packagePath, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const sd = JSON.parse(content) as StructureDefinition;

            if (sd.resourceType === 'StructureDefinition' && sd.url === url) {
              return sd;
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}
