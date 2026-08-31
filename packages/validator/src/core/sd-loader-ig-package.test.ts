import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadIGPackageIntoAvailableProfiles } from './sd-loader-ig-package';

describe('loadIGPackageIntoAvailableProfiles', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('loads an explicitly versioned package from the standard FHIR cache layout', async () => {
    const cacheRoot = await createCacheRoot();
    await writePackage(cacheRoot, 'example.fhir', '2.0.0', 'http://example.org/Profile/v2');
    await writePackage(cacheRoot, 'example.fhir', '1.0.0', 'http://example.org/Profile/v1');
    const profiles = new Set<string>();

    await loadIGPackageIntoAvailableProfiles(cacheRoot, profiles, 'example.fhir', '1.0.0');

    expect(profiles).toEqual(new Set(['http://example.org/Profile/v1']));
  });

  it('selects the newest stable installed version deterministically', async () => {
    const cacheRoot = await createCacheRoot();
    await writePackage(cacheRoot, 'example.fhir', '1.0.0', 'http://example.org/Profile/v1');
    await writePackage(cacheRoot, 'example.fhir', '3.0.0-ballot', 'http://example.org/Profile/ballot');
    await writePackage(cacheRoot, 'example.fhir', '2.0.0', 'http://example.org/Profile/v2');
    const profiles = new Set<string>();

    await loadIGPackageIntoAvailableProfiles(cacheRoot, profiles, 'example.fhir');

    expect(profiles).toEqual(new Set(['http://example.org/Profile/v2']));
  });

  it('does not substitute a different installed version for an explicit version', async () => {
    const cacheRoot = await createCacheRoot();
    await writePackage(cacheRoot, 'example.fhir', '2.0.0', 'http://example.org/Profile/v2');
    const profiles = new Set<string>();

    await loadIGPackageIntoAvailableProfiles(cacheRoot, profiles, 'example.fhir', '1.0.0');

    expect(profiles.size).toBe(0);
  });

  it('retains support for an unversioned legacy package directory', async () => {
    const cacheRoot = await createCacheRoot();
    const packageDir = path.join(cacheRoot, 'example.fhir', 'package');
    await mkdir(packageDir, { recursive: true });
    await writeStructureDefinition(packageDir, 'http://example.org/Profile/legacy');
    const profiles = new Set<string>();

    await loadIGPackageIntoAvailableProfiles(cacheRoot, profiles, 'example.fhir');

    expect(profiles).toEqual(new Set(['http://example.org/Profile/legacy']));
  });

  it.each([
    ['../outside', undefined],
    ['example.fhir/path', undefined],
    ['example.fhir', '../outside'],
  ])('rejects unsafe package references', async (packageId, version) => {
    const cacheRoot = await createCacheRoot();
    const profiles = new Set<string>();

    await loadIGPackageIntoAvailableProfiles(cacheRoot, profiles, packageId, version);

    expect(profiles.size).toBe(0);
  });

  async function createCacheRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'records-ig-package-'));
    tempDirs.push(root);
    return root;
  }
});

async function writePackage(
  cacheRoot: string,
  packageId: string,
  version: string,
  profileUrl: string,
): Promise<void> {
  const packageDir = path.join(cacheRoot, `${packageId}#${version}`, 'package');
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: packageId, version }),
  );
  await writeStructureDefinition(packageDir, profileUrl);
}

async function writeStructureDefinition(packageDir: string, profileUrl: string): Promise<void> {
  await writeFile(
    path.join(packageDir, 'StructureDefinition-test.json'),
    JSON.stringify({
      resourceType: 'StructureDefinition',
      url: profileUrl,
      type: 'Patient',
    }),
  );
}
