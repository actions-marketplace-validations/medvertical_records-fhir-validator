import * as path from 'path';
import { isSafePackageId, isSafePackageVersion } from './package-artifact-policy.js';

export function isPreReleasePackageVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.includes('-');
}

export function isSafeInstalledPackageDirectoryName(value: string): boolean {
  const parts = value.split('#');
  return parts.length === 2
    && isSafePackageId(parts[0])
    && isSafePackageVersion(parts[1]);
}

export function resolveContainedPackagePath(cachePath: string, packageId: string, version: string): string {
  const root = path.resolve(cachePath);
  const target = path.resolve(root, `${packageId}#${version}`);
  if (path.dirname(target) !== root) throw new Error('Package path escapes the cache root');
  return target;
}

export function resolveContainedTemporaryPath(cachePath: string, packageId: string): string {
  const root = path.resolve(cachePath);
  const target = path.resolve(root, `.temp-${packageId}-`);
  if (path.dirname(target) !== root) throw new Error('Temporary package path escapes the cache root');
  return target;
}
