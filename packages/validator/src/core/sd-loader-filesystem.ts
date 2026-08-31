import { promises as fs } from 'fs';
import * as path from 'path';
import type { StructureDefinition } from './structure-definition-types';
import { logger } from '../logger';
import { recordProfilePackageProvenance } from '../package/canonical-pin-provenance';
import { matchesPackageVersionPin } from './sd-loader-package-version-pin';
import {
  loadPackageProfileIndex,
  packageIndexMayContainCanonical,
  selectBetterUnversionedProfile,
  selectExactProfile,
  selectUnversionedCandidate,
  PackageProfileIndexCache,
  type IndexedProfile,
} from './sd-loader-package-profile-index';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';

function hl7UvPackagePrefix(url: string): string | null {
  const match = url.toLowerCase().match(/^https?:\/\/hl7\.org\/fhir\/uv\/([^/]+)\//);
  return match ? `hl7.fhir.uv.${match[1]}` : null;
}

export function isRelevantPackage(
  packageName: string,
  url: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  selectedCorePackageId?: string,
): boolean {
  const versionLower = fhirVersion.toLowerCase();

  if (packageName.includes('xver') || packageName.includes('extensions.r5')) {
    if (!packageName.startsWith(`hl7.fhir.uv.extensions.${versionLower}`)) {
      return false;
    }
  }

  if (url.includes('hl7.org/fhir/StructureDefinition/')) {
    const corePackage = selectedCorePackageId ?? `hl7.fhir.${versionLower}.core`;
    return packageName.startsWith(corePackage) ||
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
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
  packageVersionPins: Record<string, string> = {},
  indexCache: PackageProfileIndexCache = new PackageProfileIndexCache(),
  selectedCorePackageId?: string,
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
          if (!matchesPackageVersionPin(entry.name, packageVersionPins)) continue;

          if (!isRelevantPackage(entry.name, targetUrl, fhirVersion, selectedCorePackageId)) {
            continue;
          }

          const packagePaths = [
            path.join(source, entry.name, 'package'),
            path.join(source, entry.name)
          ];

          for (const packagePath of packagePaths) {
            try {
              if (!await packageIndexMayContainCanonical(packagePath, targetUrl, indexCache)) {
                continue;
              }
              const index = await loadPackageProfileIndex(
                packagePath,
                entry.name,
                resourceType,
                indexCache,
              );
              const exact = selectExactProfile(index, targetUrl, targetVersion, fhirVersion);
              if (exact) {
                if (targetVersion) {
                  logger.debug('[SDLoader] Loaded exact profile from package', {
                    ...profileCanonicalMetadata(url, exact.sd.version),
                  });
                  recordProfilePackageProvenance(exact.sd.url, exact.sd.version, entry.name);
                  return exact.sd;
                }
                sourceMatch = selectBetterUnversionedProfile(
                  sourceMatch,
                  exact,
                  targetUrl,
                  fhirVersion,
                );
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
            '[SDLoader] Loaded profile from local package source',
            profileCanonicalMetadata(url, sourceMatch.sd.version),
          );
          recordProfilePackageProvenance(
            sourceMatch.sd.url,
            sourceMatch.sd.version,
            sourceMatch.sourceName.split('/')[0],
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
    logger.error(
      '[SDLoader] Local profile cache load failed',
      validationFailureMetadata(error),
    );
    return null;
  }
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
