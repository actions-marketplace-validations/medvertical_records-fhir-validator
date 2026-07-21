import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';
import { packageRegistryClient, PackageRegistryClient } from './package-registry-client.js';
import { logger } from '../logger';
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_TOTAL_BYTES,
  isSafePackageArchiveEntry,
  isSafePackageId,
  isSafePackageVersion,
  packageErrorMetadata,
  packageReferenceMetadata,
  resolvePackageSizeLimit,
} from './package-artifact-policy.js';
import {
  resolveContainedPackagePath,
  resolveContainedTemporaryPath,
} from './package-downloader-paths.js';
import { PackageInstallationStore } from './package-installation-store.js';

export interface PackageDownloadOptions {
  cachePath?: string;
  force?: boolean;
  maxPackageSize?: number;
}

export interface DownloadResult {
  success: boolean;
  packageId: string;
  version: string;
  path?: string;
  error?: string;
}

export class PackageDownloader {
  private registryClient: PackageRegistryClient;
  private cachePath: string;
  private installationStore: PackageInstallationStore;
  private downloadLocks: Map<string, Promise<DownloadResult>> = new Map();

  constructor(
    cachePath?: string,
    registryClient?: PackageRegistryClient
  ) {
    this.cachePath = cachePath || this.getDefaultCachePath();
    this.registryClient = registryClient || packageRegistryClient;
    this.installationStore = new PackageInstallationStore(this.cachePath);
  }

  async downloadAndInstall(
    packageId: string,
    version?: string,
    options: PackageDownloadOptions = {}
  ): Promise<DownloadResult> {
    if (!isSafePackageId(packageId) || (version !== undefined && !isSafePackageVersion(version))) {
      return invalidPackageReference(packageId, version);
    }
    if (resolvePackageSizeLimit(options.maxPackageSize) === null) {
      return {
        success: false,
        packageId,
        version: version || 'unknown',
        error: 'Invalid package size limit',
      };
    }
    const lockKey = `${packageId}#${version || 'latest'}`;

    const pendingDownload = this.downloadLocks.get(lockKey);
    if (pendingDownload) {
      logger.info('[PackageDownloader] Waiting for an in-progress package download', packageReferenceMetadata(packageId, version));
      return pendingDownload;
    }

    const download = this.downloadAndInstallLocked(packageId, version, options);
    this.downloadLocks.set(lockKey, download);

    try {
      return await download;
    } finally {
      if (this.downloadLocks.get(lockKey) === download) {
        this.downloadLocks.delete(lockKey);
      }
    }
  }

  private async downloadAndInstallLocked(
    packageId: string,
    version: string | undefined,
    options: PackageDownloadOptions,
  ): Promise<DownloadResult> {
    try {
      if (!options.force) {
        const installed = await this.installationStore.findInstalledPackage(packageId, version);
        if (installed) {
          logger.info('[PackageDownloader] Package already installed locally', packageReferenceMetadata(installed.packageId, installed.version));
          return {
            success: true,
            packageId: installed.packageId,
            version: installed.version,
            path: installed.path
          };
        }
      }

      const infoStartTime = Date.now();
      logger.info('[PackageDownloader] Fetching package metadata', packageReferenceMetadata(packageId, version));
      const packageInfo = await this.registryClient.getPackageInfo(packageId, version);

      if (!packageInfo) {
        logger.warn('[PackageDownloader] Package not found in registry', packageReferenceMetadata(packageId, version));
        return {
          success: false,
          packageId,
          version: version || 'unknown',
          error: 'Package not found in registry'
        };
      }

      const infoTime = Date.now() - infoStartTime;
      const targetVersion = packageInfo.version;
      if (!isSafePackageVersion(targetVersion)) {
        throw new Error('Registry returned an invalid package version');
      }
      const packageDir = resolveContainedPackagePath(this.cachePath, packageId, targetVersion);
      logger.info('[PackageDownloader] Package metadata retrieved', {
        ...packageReferenceMetadata(packageId, targetVersion),
        durationMs: infoTime,
      });

      if (!options.force && await this.installationStore.isPackageInstalled(packageDir)) {
        logger.info('[PackageDownloader] Package already installed', packageReferenceMetadata(packageId, targetVersion));
        return {
          success: true,
          packageId,
          version: targetVersion,
          path: packageDir
        };
      }

      const downloadStartTime = Date.now();
      logger.info('[PackageDownloader] Downloading package tarball', packageReferenceMetadata(packageId, targetVersion));
      const maxSize = resolvePackageSizeLimit(options.maxPackageSize)!;
      const tarballBuffer = await this.registryClient.downloadPackageTarball(packageId, targetVersion, maxSize);

      if (!tarballBuffer) {
        logger.warn('[PackageDownloader] Package tarball download failed', packageReferenceMetadata(packageId, targetVersion));
        return {
          success: false,
          packageId,
          version: targetVersion,
          error: 'Failed to download tarball'
        };
      }

      const downloadTime = Date.now() - downloadStartTime;
      const tarballSizeMB = (tarballBuffer.length / 1024 / 1024).toFixed(2);
      logger.info('[PackageDownloader] Package tarball downloaded', {
        ...packageReferenceMetadata(packageId, targetVersion),
        bytes: tarballBuffer.length,
        durationMs: downloadTime,
      });

      if (tarballBuffer.length > maxSize) {
        logger.warn('[PackageDownloader] Package tarball exceeds configured size limit', {
          ...packageReferenceMetadata(packageId, targetVersion),
          bytes: tarballBuffer.length,
          maxBytes: maxSize,
        });
        return {
          success: false,
          packageId,
          version: targetVersion,
          error: `Package too large: ${tarballSizeMB} MB (max: ${maxSize / 1024 / 1024} MB)`
        };
      }

      const tempDir = resolveContainedTemporaryPath(this.cachePath, packageId);
      await fs.mkdir(tempDir, { recursive: true });

      try {
        await this.extractTarball(tarballBuffer, tempDir);

        if (!await this.installationStore.verifyPackage(tempDir, packageId, targetVersion)) {
          throw new Error('Package verification failed');
        }

        await fs.mkdir(this.cachePath, { recursive: true });
        
        if (await this.installationStore.isPackageInstalled(packageDir)) {
          await fs.rm(packageDir, { recursive: true, force: true });
        }

        await fs.rename(tempDir, packageDir);

        logger.info('[PackageDownloader] Package installed', packageReferenceMetadata(packageId, targetVersion));

        return {
          success: true,
          packageId,
          version: targetVersion,
          path: packageDir
        };

      } catch (error: unknown) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
        }

        throw error;
      }

    } catch (error: unknown) {
      logger.error('[PackageDownloader] Package installation failed', {
        ...packageReferenceMetadata(packageId, version),
        ...packageErrorMetadata(error),
      });
      return {
        success: false,
        packageId,
        version: version || 'unknown',
        error: 'Package installation failed',
      };
    }
  }

  private async extractTarball(tarballBuffer: Buffer, targetPath: string): Promise<void> {
    try {
      logger.info('[PackageDownloader] Extracting package tarball', { bytes: tarballBuffer.length });

      const tempTarballPath = path.join(targetPath, '.temp-tarball.tgz');
      await fs.writeFile(tempTarballPath, tarballBuffer);

      try {
        let unsafeEntryFound = false;
        let entryCount = 0;
        let totalDeclaredBytes = 0;
        await tar.extract({
          file: tempTarballPath,
          cwd: targetPath,
          strict: true,
          preservePaths: false,
          filter: (entryPath, entry) => {
            const entryType = 'type' in entry ? entry.type : undefined;
            const entrySize = typeof entry.size === 'number' ? entry.size : undefined;
            entryCount++;
            totalDeclaredBytes += entrySize ?? 0;
            if (
              entryCount > MAX_ARCHIVE_ENTRIES
              || totalDeclaredBytes > MAX_ARCHIVE_TOTAL_BYTES
              || !isSafePackageArchiveEntry(entryPath, entryType, entrySize)
            ) {
              unsafeEntryFound = true;
              return false;
            }
            return true;
          },
        });
        if (unsafeEntryFound) {
          throw new Error('Package archive contains an unsafe entry');
        }

        logger.info('[PackageDownloader] Package tarball extraction complete', {
          entryCount,
          declaredBytes: totalDeclaredBytes,
        });

      } finally {
        try {
          await fs.unlink(tempTarballPath);
        } catch {
        }
      }

    } catch (error: unknown) {
      logger.error('[PackageDownloader] Package tarball extraction failed', packageErrorMetadata(error));
      throw new Error('Failed to extract package tarball');
    }
  }

  private getDefaultCachePath(): string {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) {
      return '/tmp/fhir-packages';
    }
    return path.join(home, '.fhir', 'packages');
  }

  async listInstalledPackages(): Promise<string[]> {
    return this.installationStore.listInstalledPackages();
  }

  async removePackage(packageId: string, version: string): Promise<boolean> {
    return this.installationStore.removePackage(packageId, version);
  }

  getCachePath(): string {
    return this.cachePath;
  }
}

function invalidPackageReference(packageId: string, version?: string): DownloadResult {
  return {
    success: false,
    packageId,
    version: version || 'unknown',
    error: 'Invalid package identifier or version',
  };
}

export const packageDownloader = new PackageDownloader();
