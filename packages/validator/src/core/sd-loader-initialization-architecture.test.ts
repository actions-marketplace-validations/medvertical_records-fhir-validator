import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('StructureDefinition cache initialization architecture', () => {
  it('separates package discovery from host profile warm-up', () => {
    const runtime = readSource('sd-loader-cache-runtime.ts');
    const packageScanning = readSource('sd-loader-package-source-scanning.ts');
    const profileWarmup = readSource('sd-loader-profile-source-warmup.ts');

    expect(runtime).toContain("from './sd-loader-package-source-scanning'");
    expect(runtime).toContain("from './sd-loader-profile-source-warmup'");
    expect(packageScanning).toMatch(/fs|scanCacheDirectory/);
    expect(packageScanning).not.toMatch(/getProfileSource|loadAllForWarmup/);
    expect(profileWarmup).toMatch(/getProfileSource|loadAllForWarmup/);
    expect(profileWarmup).not.toMatch(/scanCacheDirectory|fs\.access/);
  });
});
