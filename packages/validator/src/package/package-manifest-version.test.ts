import { describe, expect, it } from 'vitest';
import { resolvePackageManifestVersion } from './package-manifest-version';
import type { PackageManifest, PackageVersion } from './package-registry-types';

describe('resolvePackageManifestVersion', () => {
  it('chooses the highest stable valid version when the latest tag is unusable', () => {
    const packageManifest = manifest({
      '1.0.0': version('1.0.0'),
      '3.0.0-ballot': version('3.0.0-ballot'),
      '2.0.0': version('2.0.0'),
      '../unsafe': version('../unsafe'),
    }, '../unsafe');

    expect(resolvePackageManifestVersion(packageManifest)).toBe('2.0.0');
  });

  it('rejects missing requested versions instead of returning a phantom version', () => {
    expect(resolvePackageManifestVersion(
      manifest({ '1.0.0': version('1.0.0') }, '1.0.0'),
      '2.0.0',
    )).toBeNull();
  });

  it('ignores version entries whose identity does not match the manifest', () => {
    const mismatched = version('2.0.0');
    mismatched.name = 'other.fhir';

    expect(resolvePackageManifestVersion(
      manifest({ '2.0.0': mismatched, '1.0.0': version('1.0.0') }),
    )).toBe('1.0.0');
  });
});

function manifest(
  versions: Record<string, PackageVersion>,
  latest?: string,
): PackageManifest {
  return {
    name: 'example.fhir',
    'dist-tags': { latest },
    versions,
  };
}

function version(value: string): PackageVersion {
  return {
    name: 'example.fhir',
    version: value,
    dist: { tarball: `https://packages.fhir.org/example.fhir/${value}` },
  };
}
