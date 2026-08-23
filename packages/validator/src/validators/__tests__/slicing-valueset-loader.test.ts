import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createIsolatedSlicingValueSetLoader } from '../slicing-valueset-loader';

const originalCachePath = process.env.FHIR_PACKAGE_CACHE_PATH;

describe('slicing ValueSet loader boundary', () => {
  afterEach(() => {
    if (originalCachePath === undefined) {
      delete process.env.FHIR_PACKAGE_CACHE_PATH;
    } else {
      process.env.FHIR_PACKAGE_CACHE_PATH = originalCachePath;
    }
  });

  // The user package cache ranks last: it supplements the repo-bundled
  // stores but must never shadow them (see defaultPackageDirectories).
  it('uses the real home directory when dotenv left a literal $HOME path', () => {
    process.env.FHIR_PACKAGE_CACHE_PATH = '$HOME/.fhir/packages';

    const loader = createIsolatedSlicingValueSetLoader();

    expect(process.env.FHIR_PACKAGE_CACHE_PATH).toBe('$HOME/.fhir/packages');
    expect(loader.getPackageDirectories()).toContain(join(homedir(), '.fhir', 'packages'));
  });

  it('preserves explicit non-placeholder package cache paths', () => {
    const explicitPath = resolve('/tmp/records-fhir-cache');
    process.env.FHIR_PACKAGE_CACHE_PATH = explicitPath;

    const loader = createIsolatedSlicingValueSetLoader();

    expect(process.env.FHIR_PACKAGE_CACHE_PATH).toBe(explicitPath);
    const directories = loader.getPackageDirectories();
    expect(directories[directories.length - 1]).toBe(explicitPath);
  });

  it('searches the current bundled profile package directory for slicing ValueSets', () => {
    const loader = createIsolatedSlicingValueSetLoader();

    expect(loader.getPackageDirectories()).toContain(
      join(process.cwd(), 'packages', 'bundled-profiles', 'storage', 'profiles', 'bundled'),
    );
  });

  it('does not mutate the process-wide path while creating multiple loaders', () => {
    process.env.FHIR_PACKAGE_CACHE_PATH = '$HOME/.fhir/packages';

    const first = createIsolatedSlicingValueSetLoader();
    const second = createIsolatedSlicingValueSetLoader();

    expect(process.env.FHIR_PACKAGE_CACHE_PATH).toBe('$HOME/.fhir/packages');
    expect(first).not.toBe(second);
  });
});
