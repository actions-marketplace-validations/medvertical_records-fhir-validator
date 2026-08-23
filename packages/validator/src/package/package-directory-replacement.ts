import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  resolveContainedPackagePath,
  resolveContainedTemporaryPath,
} from './package-downloader-paths.js';

export interface PackageDirectoryOperations {
  access(targetPath: string): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(targetPath: string, options: { recursive: true; force: true }): Promise<void>;
}

const defaultOperations: PackageDirectoryOperations = {
  access: targetPath => fs.access(targetPath),
  mkdtemp: prefix => fs.mkdtemp(prefix),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  rm: (targetPath, options) => fs.rm(targetPath, options),
};

export async function replaceInstalledPackageDirectory(params: {
  cachePath: string;
  packageId: string;
  version: string;
  replacementPath: string;
  operations?: PackageDirectoryOperations;
}): Promise<void> {
  const {
    cachePath,
    packageId,
    version,
    replacementPath,
    operations = defaultOperations,
  } = params;
  const targetPath = resolveContainedPackagePath(cachePath, packageId, version);
  assertContainedReplacementPath(cachePath, packageId, replacementPath);

  if (!await pathExists(targetPath, operations)) {
    await operations.rename(replacementPath, targetPath);
    return;
  }

  const backupPath = await operations.mkdtemp(
    resolveContainedTemporaryPath(cachePath, `${packageId}-backup`),
  );
  await operations.rm(backupPath, { recursive: true, force: true });
  await operations.rename(targetPath, backupPath);

  try {
    await operations.rename(replacementPath, targetPath);
  } catch (replacementError) {
    try {
      await operations.rename(backupPath, targetPath);
    } catch {
      throw new Error('Package replacement and rollback failed');
    }
    throw replacementError;
  }

  await operations.rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
}

async function pathExists(
  targetPath: string,
  operations: PackageDirectoryOperations,
): Promise<boolean> {
  try {
    await operations.access(targetPath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertContainedReplacementPath(
  cachePath: string,
  packageId: string,
  replacementPath: string,
): void {
  const root = path.resolve(cachePath);
  const replacement = path.resolve(replacementPath);
  if (
    path.dirname(replacement) !== root
    || !path.basename(replacement).startsWith(`.temp-${packageId}-`)
  ) {
    throw new Error('Replacement package path escapes the cache root');
  }
}
