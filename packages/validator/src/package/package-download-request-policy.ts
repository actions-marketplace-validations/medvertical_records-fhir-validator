import { homedir } from 'node:os';
import * as path from 'node:path';
import {
  isSafePackageId,
  isSafePackageVersion,
  resolvePackageSizeLimit,
} from './package-artifact-policy.js';
import { resolveContainedPackagePath } from './package-downloader-paths.js';

export interface PackageDownloadOptions {
  /** @deprecated Configure the cache path on PackageDownloader instead. */
  cachePath?: string;
  force?: boolean;
  maxPackageSize?: number;
}

export interface ResolvedPackageDownloadOptions {
  force: boolean;
  maxPackageSize: number;
}

export type PackageDownloadRequestResolution =
  | {
    accepted: true;
    lockKey: string;
    options: ResolvedPackageDownloadOptions;
  }
  | {
    accepted: false;
    error: string;
  };

export function resolvePackageDownloadRequest(
  packageId: string,
  version: string | undefined,
  configuredCachePath: string,
  options: PackageDownloadOptions,
): PackageDownloadRequestResolution {
  if (!isValidPackageReference(packageId, version)) {
    return { accepted: false, error: 'Invalid package identifier or version' };
  }
  if (!matchesConfiguredCachePath(options.cachePath, configuredCachePath)) {
    return {
      accepted: false,
      error: 'Per-call cache path does not match downloader cache path',
    };
  }

  const maxPackageSize = resolvePackageSizeLimit(options.maxPackageSize);
  if (maxPackageSize === null) {
    return { accepted: false, error: 'Invalid package size limit' };
  }

  return {
    accepted: true,
    lockKey: `${packageId}#${version || 'latest'}`,
    options: {
      force: options.force === true,
      maxPackageSize,
    },
  };
}

export function isValidPackageReference(
  packageId: string,
  version?: string,
): boolean {
  return isSafePackageId(packageId)
    && (version === undefined || isSafePackageVersion(version));
}

export function resolvePackageInstallationTarget(
  configuredCachePath: string,
  requestedPackageId: string,
  registryPackageId: string,
  targetVersion: string,
): string {
  if (
    registryPackageId !== requestedPackageId
    || !isSafePackageId(registryPackageId)
    || !isSafePackageVersion(targetVersion)
  ) {
    throw new Error('Registry returned an invalid package identity');
  }
  return resolveContainedPackagePath(
    configuredCachePath,
    requestedPackageId,
    targetVersion,
  );
}

export function getDefaultPackageCachePath(): string {
  const home = homedir();
  return home ? path.join(home, '.fhir', 'packages') : '/tmp/fhir-packages';
}

function matchesConfiguredCachePath(
  requestedCachePath: string | undefined,
  configuredCachePath: string,
): boolean {
  return requestedCachePath === undefined
    || (
      typeof requestedCachePath === 'string'
      && path.resolve(requestedCachePath) === path.resolve(configuredCachePath)
    );
}
