import type { PackageManifest } from './package-registry-types.js';
import { isSafePackageVersion } from './package-artifact-policy.js';
import { compareVersions } from '../package-resolver/version-comparator.js';

function getLatestManifestVersion(manifest: PackageManifest): string | null {
  const versions = Object.keys(manifest.versions)
    .filter(version => isManifestVersion(manifest, version));
  if (versions.length === 0) return null;

  const stableVersions = versions.filter(version => !version.includes('-'));
  const candidates = stableVersions.length > 0 ? stableVersions : versions;
  return candidates.sort((left, right) => compareVersions(right, left))[0];
}

function normalizeShortSemverVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)$/);
  return match ? `${match[1]}.${match[2]}.0` : version;
}

export function resolvePackageManifestVersion(
  manifest: PackageManifest,
  requestedVersion?: string,
): string | null {
  if (requestedVersion) {
    if (isManifestVersion(manifest, requestedVersion)) return requestedVersion;

    const normalizedVersion = normalizeShortSemverVersion(requestedVersion);
    if (
      normalizedVersion !== requestedVersion
      && isManifestVersion(manifest, normalizedVersion)
    ) {
      return normalizedVersion;
    }
    return null;
  }

  const taggedLatest = manifest['dist-tags'].latest;
  if (
    taggedLatest
    && isManifestVersion(manifest, taggedLatest)
  ) {
    return taggedLatest;
  }
  return getLatestManifestVersion(manifest);
}

function isManifestVersion(manifest: PackageManifest, version: string): boolean {
  const entry = manifest.versions[version];
  return isSafePackageVersion(version)
    && entry?.name === manifest.name
    && entry.version === version;
}
