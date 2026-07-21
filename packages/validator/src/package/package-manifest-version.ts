import type { PackageManifest } from './package-registry-types.js';

function getLatestManifestVersion(manifest: PackageManifest): string | null {
  const versions = Object.keys(manifest.versions);
  if (versions.length === 0) return null;

  versions.sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let index = 0; index < Math.max(aParts.length, bParts.length); index++) {
      const difference = (bParts[index] || 0) - (aParts[index] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  return versions[0];
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
    if (manifest.versions[requestedVersion]) return requestedVersion;

    const normalizedVersion = normalizeShortSemverVersion(requestedVersion);
    if (normalizedVersion !== requestedVersion && manifest.versions[normalizedVersion]) {
      return normalizedVersion;
    }
    return requestedVersion;
  }

  return manifest['dist-tags'].latest || getLatestManifestVersion(manifest);
}
