import { logger } from '../logger';
import { packageTargetMetadata } from '../package/package-artifact-policy';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import type { AutoDownloadSourceContext } from './sd-loader-auto-download-source-context';
import { cacheDownloadedProfile } from './sd-loader-downloaded-profile-cache';
import { loadFromLocalCache } from './sd-loader-filesystem';
import { isPackageAllowed } from './sd-loader-package-config';
import type { StructureDefinition } from './structure-definition-types';

/** Resolve a profile by detecting, installing, and reading its FHIR package. */
export async function tryPackageRegistrySource(
  url: string,
  context: AutoDownloadSourceContext,
  requestedFhirVersion: 'R4' | 'R5' | 'R6',
): Promise<StructureDefinition | null> {
  const packageId = await context.registryClient.detectPackageForProfile(url);
  if (!packageId) return null;
  if (!isPackageAllowed(packageId, context.allowedPackages)) {
    logger.warn(
      '[SDLoader] Package is not in allowed list',
      packageTargetMetadata(packageId),
    );
    return null;
  }

  const packageVersion = context.packageVersionPins?.[packageId] ?? getCanonicalVersion(url);
  const downloadResult = await context.packageDownloader.downloadAndInstall(packageId, packageVersion);
  if (!downloadResult.success) {
    logger.warn('[SDLoader] Package download failed');
    throw new Error('Profile package download failed');
  }

  const profile = await loadFromLocalCache(
    url,
    context.packageSources,
    requestedFhirVersion,
    {
      ...context.packageVersionPins,
      [downloadResult.packageId]: downloadResult.version,
    },
    context.packageProfileIndexCache,
  );
  if (!profile) {
    logger.warn('[SDLoader] Profile still not found after downloading package', profileCanonicalMetadata(url));
    return null;
  }
  logger.info('[SDLoader] Profile loaded from package', profileCanonicalMetadata(url));
  return cacheDownloadedProfile(url, profile, context);
}

function getCanonicalVersion(url: string): string | undefined {
  const separatorIndex = url.indexOf('|');
  if (separatorIndex < 0) return undefined;
  const version = url.slice(separatorIndex + 1).trim();
  return version.length > 0 ? version : undefined;
}
