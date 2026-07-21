import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';
import {
  isSafePackageId,
  isSafePackageVersion,
  packageErrorMetadata,
  packageReferenceMetadata,
} from './package-artifact-policy.js';
import {
  isPreReleasePackageVersion,
  isSafeInstalledPackageDirectoryName,
  resolveContainedPackagePath,
} from './package-downloader-paths.js';

export interface InstalledPackage {
  packageId: string;
  version: string;
  path: string;
}

export class PackageInstallationStore {
  constructor(private readonly cachePath: string) {}

  async verifyPackage(
    packagePath: string,
    expectedPackageId: string,
    expectedVersion: string,
  ): Promise<boolean> {
    const packageJsonPath = path.join(packagePath, 'package', 'package.json');
    try {
      await fs.access(packageJsonPath);
    } catch {
      logger.error('[PackageDownloader] Package verification failed: manifest missing');
      return false;
    }

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
        name?: string;
        version?: string;
      };
      if (
        !isSafePackageId(packageJson.name ?? '')
        || !isSafePackageVersion(packageJson.version ?? '')
        || packageJson.name !== expectedPackageId
        || packageJson.version !== expectedVersion
      ) {
        logger.error('[PackageDownloader] Package verification failed: manifest identity mismatch');
        return false;
      }

      logger.info(
        '[PackageDownloader] Package verified',
        packageReferenceMetadata(expectedPackageId, expectedVersion),
      );
      return true;
    } catch {
      logger.error('[PackageDownloader] Package verification failed: invalid manifest');
      return false;
    }
  }

  async isPackageInstalled(packagePath: string): Promise<boolean> {
    try {
      await fs.access(packagePath);
      await fs.access(path.join(packagePath, 'package', 'package.json'));
      return true;
    } catch {
      return false;
    }
  }

  async findInstalledPackage(packageId: string, version?: string): Promise<InstalledPackage | null> {
    try {
      const entries = await fs.readdir(this.cachePath, { withFileTypes: true });
      const candidates = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => this.matchesInstalledPackageName(name, packageId, version));

      for (const candidate of candidates) {
        const packageDir = path.join(this.cachePath, candidate);
        if (!await this.isPackageInstalled(packageDir)) continue;

        const manifest = await this.readInstalledPackageManifest(packageDir);
        const [namePart, versionPart] = candidate.split('#');
        if (
          manifest
          && (
            !isSafePackageId(manifest.name ?? '')
            || !isSafePackageVersion(manifest.version ?? '')
            || manifest.name !== namePart
            || manifest.version !== versionPart
          )
        ) {
          continue;
        }
        const installedVersion = manifest?.version || versionPart || version || 'unknown';
        if (!version && isPreReleasePackageVersion(installedVersion)) {
          logger.info(
            '[PackageDownloader] Skipping installed pre-release for unversioned request',
            packageReferenceMetadata(manifest?.name || namePart, installedVersion),
          );
          continue;
        }

        return {
          packageId: manifest?.name || namePart,
          version: installedVersion,
          path: packageDir,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async listInstalledPackages(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.cachePath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory() && isSafeInstalledPackageDirectoryName(entry.name))
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  async removePackage(packageId: string, version: string): Promise<boolean> {
    if (!isSafePackageId(packageId) || !isSafePackageVersion(version)) return false;
    try {
      const packageDir = resolveContainedPackagePath(this.cachePath, packageId, version);
      if (!await this.isPackageInstalled(packageDir)) {
        logger.warn(
          '[PackageDownloader] Package is not installed',
          packageReferenceMetadata(packageId, version),
        );
        return false;
      }

      await fs.rm(packageDir, { recursive: true, force: true });
      logger.info('[PackageDownloader] Package removed', packageReferenceMetadata(packageId, version));
      return true;
    } catch (error: unknown) {
      logger.error('[PackageDownloader] Package removal failed', {
        ...packageReferenceMetadata(packageId, version),
        ...packageErrorMetadata(error),
      });
      return false;
    }
  }

  private matchesInstalledPackageName(name: string, packageId: string, version?: string): boolean {
    const [installedId, installedVersion] = name.split('#');
    if (
      !installedId
      || !installedVersion
      || !isSafePackageId(installedId)
      || !isSafePackageVersion(installedVersion)
    ) {
      return false;
    }
    if (version && installedVersion !== version) return false;
    return installedId === packageId || installedId.startsWith(`${packageId}.`);
  }

  private async readInstalledPackageManifest(
    packageDir: string,
  ): Promise<{ name?: string; version?: string } | null> {
    try {
      const content = await fs.readFile(path.join(packageDir, 'package', 'package.json'), 'utf-8');
      return JSON.parse(content) as { name?: string; version?: string };
    } catch {
      return null;
    }
  }
}
