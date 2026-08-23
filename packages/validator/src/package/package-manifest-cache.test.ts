import { describe, expect, it } from 'vitest';
import { PackageManifestCache } from './package-manifest-cache';
import type { PackageManifest } from './package-registry-types';

describe('PackageManifestCache', () => {
  it('normalizes invalid bounds instead of creating an unbounded cache', () => {
    const cache = new PackageManifestCache(Number.NaN, Number.POSITIVE_INFINITY);

    for (let index = 0; index < 140; index++) {
      cache.set(`package-${index}`, manifest(`package-${index}`));
    }

    expect(cache.getStats()).toMatchObject({
      size: 128,
      maxSize: 128,
      evictions: 12,
    });
  });

  it('isolates cached manifests from mutations by callers', () => {
    const cache = new PackageManifestCache(2);
    const original = manifest('example.fhir');
    cache.set('example.fhir', original);
    original.versions['1.0.0'].dist.tarball = 'https://attacker.invalid/changed';

    const firstRead = cache.get('example.fhir')!;
    expect(firstRead.versions['1.0.0'].dist.tarball).toBe('https://packages.fhir.org/example.fhir/1.0.0');
    firstRead.versions['1.0.0'].dist.tarball = 'https://attacker.invalid/changed-again';

    expect(cache.get('example.fhir')!.versions['1.0.0'].dist.tarball)
      .toBe('https://packages.fhir.org/example.fhir/1.0.0');
  });
});

function manifest(packageId: string): PackageManifest {
  return {
    name: packageId,
    'dist-tags': { latest: '1.0.0' },
    versions: {
      '1.0.0': {
        name: packageId,
        version: '1.0.0',
        dist: { tarball: `https://packages.fhir.org/${packageId}/1.0.0` },
      },
    },
  };
}
