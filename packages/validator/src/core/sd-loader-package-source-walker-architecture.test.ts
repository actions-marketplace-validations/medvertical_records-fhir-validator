import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('SD loader package source architecture', () => {
  it('separates persistent-index policy from package source walking', () => {
    const scanner = readSource('sd-loader-package-scanner.ts');
    const walker = readSource('sd-loader-package-source-walker.ts');

    expect(scanner).toMatch(/loadFromPersistentIndex|saveToPersistentIndex|walkPackageSource/);
    expect(scanner).not.toMatch(/fs\.readdir|selectPackageVersions|packageDetails\.push/);

    expect(walker).toMatch(/fs\.readdir|selectPackageVersions|packageDetails\.push/);
    expect(walker).not.toMatch(/loadFromPersistentIndex|saveToPersistentIndex/);
  });

  it('keeps package parsing and directory scanning available from the compatibility facade', () => {
    const scanner = readSource('sd-loader-package-scanner.ts');

    expect(scanner).toContain("from './sd-loader-package-source-walker'");
    expect(scanner).toMatch(/parsePackageName|scanPackageDirectory/);
  });
});
