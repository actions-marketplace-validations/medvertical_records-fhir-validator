/**
 * StructureDefinition Loader - Filesystem Operations
 * 
 * Utilities for loading StructureDefinitions from local filesystem.
 * Extracted from structure-definition-loader.ts to comply with global.mdc guidelines.
 */

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
  // EHDS EPS preview/reference packages use prerelease labels such as
  // 1.0.0-alpha and 1.0.0-xtehr. ART-DECOR resources declare unversioned
  // canonicals, so rejecting those local packages would silently fall back to
  // base FHIR and skip the EPS slice rules we explicitly need to validate.
  return targetUrl.includes('hl7.eu/fhir/eps');
}

function hl7UvPackagePrefix(url: string): string | null {
  const match = url.toLowerCase().match(/^https?:\/\/hl7\.org\/fhir\/uv\/([^/]+)\//);
  return match ? `hl7.fhir.uv.${match[1]}` : null;
}

/**
 * Check if a package is relevant for a given profile URL and version
 */
export function isRelevantPackage(
  packageName: string,
  url: string,
  fhirVersion: 'R4' | 'R5' | 'R6'
): boolean {
  const versionLower = fhirVersion.toLowerCase();

  // Exclude cross-version extension packages for core FHIR types.
  // These packages (xver, extensions.r5) contain R5 extensions that should not
  // be used when loading core R4 StructureDefinitions.
  if (packageName.includes('xver') || packageName.includes('extensions.r5')) {
    if (!packageName.startsWith(`hl7.fhir.uv.extensions.${versionLower}`)) {
      return false;
    }
  }

  // Core FHIR profiles and HL7-published extension StructureDefinitions share
  // the same canonical namespace. Search both the core package and the
  // matching-version HL7 extension package so URLs such as
  // http://hl7.org/fhir/StructureDefinition/itemWeight resolve locally.
  if (url.includes('hl7.org/fhir/StructureDefinition/')) {
    return packageName.startsWith(`hl7.fhir.${versionLower}.core`) ||
      packageName.startsWith(`hl7.fhir.uv.extensions.${versionLower}`);
  }

  // US Core
  if (url.includes('hl7.org/fhir/us/core')) {
    return packageName.startsWith('hl7.fhir.us.core');
  }

  const uvPackagePrefix = hl7UvPackagePrefix(url);
  if (uvPackagePrefix) {
    return packageName.toLowerCase().startsWith(uvPackagePrefix);
  }

  // German profiles (Basisprofil + Einwilligungsmanagement)
  if (url.includes('fhir.de') || url.includes('basisprofil')) {
    return packageName.startsWith('de.basisprofil') ||
      packageName.startsWith('de.einwilligungsmanagement');
  }

  // KBV packages are split by domain. Restricting these avoids broad cache
  // scans during batch validation and keeps versioned package lookups inside
  // the owning IG package.
  if (url.includes('fhir.kbv.de')) {
    if (url.includes('KBV_') && url.includes('_EAU_')) {
      return packageName.startsWith('kbv.ita.eau');
    }
    if (url.includes('KBV_') && url.includes('_FOR_')) {
      return packageName.startsWith('kbv.ita.for');
    }
    return packageName.startsWith('kbv.');
  }

  // HL7 Europe packages. Without these guards, EU profile lookups fall
  // through to the generic "scan every package" path and repeatedly parse
  // large unrelated IGs during batch validation.
  if (url.includes('hl7.eu/fhir/eps')) {
    return packageName.startsWith('hl7.fhir.eu.eps');
  }

  if (url.includes('hl7.eu/fhir/base')) {
    return packageName.startsWith('hl7.fhir.eu.base');
  }

  if (url.includes('hl7.eu/fhir') || url.includes('hl7.eu/')) {
    return packageName.startsWith('hl7.fhir.eu.');
  }

  // IHE Pharmacy MPD extension/profile canonicals used by the EU EPS
  // Medication profiles. Restrict to the MPD R4 package instead of scanning
  // every local package for each extension URL.
  if (url.includes('profiles.ihe.net/PHARM/MPD')) {
    return packageName.startsWith('ihe.pharm.mpd.r4');
  }

  // ISiP profiles (nursing care – de.gematik.isip package)
  if (url.includes('gematik.de') && url.includes('/fhir/isip/')) {
    return packageName.startsWith('de.gematik.isip');
  }

  // ISiK profiles (hospital interoperability – de.gematik.isik packages)
  if (url.includes('gematik.de') && url.includes('/fhir/isik/')) {
    return packageName.startsWith('de.gematik.isik') || packageName.startsWith('de.gematik.isip');
  }

  // MII profiles
  if (url.includes('medizininformatikinitiative') || url.includes('medizininformatik-initiative') || url.includes('mii')) {
    return packageName.startsWith('de.medizininformatikinitiative');
  }

  // UK Core - support multiple package naming conventions
  if (url.includes('fhir.uk') || url.includes('uk.core') || url.includes('hl7.org.uk')) {
    return packageName.startsWith('UK.Core') ||
      packageName.startsWith('uk.core') ||
      packageName.startsWith('fhir.r4.ukcore') ||
      packageName.startsWith('uk.nhsdigital');
  }

  // If unsure, include package
  return true;
}

/**
 * Load StructureDefinition from local cache (multi-source)
 * Tries sources in priority order: bundled → cache
 */
export async function loadFromLocalCache(
  url: string,
  packageSources: string[],
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
): Promise<StructureDefinition | null> {
  try {
    // Handle versioned URLs
    let targetUrl = url;
    let targetVersion: string | undefined;
    if (url.includes('|')) {
      const parts = url.split('|');
      targetUrl = parts[0];
      targetVersion = parts[1];
    }

    // Extract resource type from URL (remove version if present)
    const resourceType = targetUrl.split('/').pop();
    if (!resourceType) return null;

    // Try each package source in priority order
    for (const source of packageSources) {
      try {
        // Read package directories
        const entries = await fs.readdir(source, { withFileTypes: true });
        let sourceMatch: IndexedProfile | null = null;

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          // Optimization: Skip irrelevant packages based on FHIR version
          if (!isRelevantPackage(entry.name, targetUrl, fhirVersion)) {
            continue;
          }

          // Try both package/ subdirectory and root directory
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
              continue; // Try next path
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
        continue; // Try next source
      }
    }

    // For explicitly versioned canonicals, a different version is not a
    // usable fallback. Returning it makes the validator apply the wrong IG
    // rules and can produce false profile-slice errors.
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

/**
 * Load StructureDefinition from a specific source directory
 */
export async function loadFromSource(
  sourcePath: string,
  url: string,
  resourceType: string,
  fhirVersion: 'R4' | 'R5' | 'R6'
): Promise<StructureDefinition | null> {
  // Scan all package directories for this profile
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageName = entry.name;

    // Determine if this package is relevant based on URL and version
    const isRelevant = isRelevantPackage(packageName, url, fhirVersion);

    if (isRelevant) {
      // Try to load from this package
      const packagePath = path.join(sourcePath, packageName, 'package');

      try {
        // First try the simple filename (e.g., StructureDefinition-Patient.json)
        const simpleFileName = `StructureDefinition-${resourceType}.json`;
        const simpleFilePath = path.join(packagePath, simpleFileName);

        try {
          const content = await fs.readFile(simpleFilePath, 'utf-8');
          const sd = JSON.parse(content) as StructureDefinition;
          if (sd.url === url) {
            return sd;
          }
        } catch {
          // File not found with simple name, will search all files below
        }

        // Search all JSON files in package (some IGs don't prefix with "StructureDefinition-")
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
            // Parse error or read error, skip this file
            continue;
          }
        }
      } catch {
        // Package directory not accessible, try next package
        continue;
      }
    }
  }

  return null;
}
