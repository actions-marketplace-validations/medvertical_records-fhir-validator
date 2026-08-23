import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('tenant profile source architecture', () => {
  it('keeps host resolution and canonical matching behind one adapter', () => {
    const sourceAdapter = readSource('tenant-profile-source-resolution.ts');
    const loader = readSource('sd-loader-load.ts');
    const snapshotLoading = readSource('profile-snapshot-loading.ts');

    for (const consumer of [loader, snapshotLoading]) {
      expect(consumer).toContain("from './tenant-profile-source-resolution'");
      expect(consumer).not.toMatch(/getProfileSource|profileMatchesCanonical/);
    }
    expect(sourceAdapter).toMatch(/getProfileSource|profileMatchesCanonical/);
    expect(sourceAdapter).not.toMatch(
      /logger|validationFailureMetadata|matchesRequestedFhirVersion|expectedPrefix/,
    );
  });
});
