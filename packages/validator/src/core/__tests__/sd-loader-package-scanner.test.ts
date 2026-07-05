import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanCacheDirectory, scanPackageDirectory } from '../sd-loader-package-scanner';

describe('sd-loader-package-scanner', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('indexes versioned canonical aliases for local StructureDefinitions', async () => {
    const packageDir = await mkdtemp(path.join(tmpdir(), 'sd-loader-package-'));
    tempDirs.push(packageDir);

    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, 'StructureDefinition-mii-pr-patho-attached-image.json'),
      JSON.stringify({
        resourceType: 'StructureDefinition',
        url: 'https://www.medizininformatik-initiative.de/fhir/ext/modul-patho/StructureDefinition/mii-pr-patho-attached-image',
        version: '2026.0.0',
        fhirVersion: '4.0.1',
        type: 'Media',
      }),
    );

    const availableProfiles = new Set<string>();
    await scanPackageDirectory(packageDir, availableProfiles);

    expect(availableProfiles.has(
      'https://www.medizininformatik-initiative.de/fhir/ext/modul-patho/StructureDefinition/mii-pr-patho-attached-image',
    )).toBe(true);
    expect(availableProfiles.has(
      'https://www.medizininformatik-initiative.de/fhir/ext/modul-patho/StructureDefinition/mii-pr-patho-attached-image|2026.0.0',
    )).toBe(true);
  });

  it('keeps the persistent index valid for deduplicated skipped package versions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sd-loader-cache-'));
    tempDirs.push(root);

    const oldProfile = 'http://example.org/fhir/StructureDefinition/old-profile';
    const latestProfile = 'http://example.org/fhir/StructureDefinition/latest-profile';
    await writeStructureDefinition(root, 'example.fhir.package#1.0.0', 'StructureDefinition-old.json', oldProfile);
    const latestFile = await writeStructureDefinition(
      root,
      'example.fhir.package#2.0.0',
      'StructureDefinition-latest.json',
      latestProfile,
    );

    const externalProfile = 'http://example.org/fhir/StructureDefinition/external-profile';
    const firstProfiles = new Set<string>([externalProfile]);
    const firstScanned = await scanCacheDirectory(root, firstProfiles);

    expect(firstScanned).toBe(1);
    expect(firstProfiles.has(latestProfile)).toBe(true);
    expect(firstProfiles.has(oldProfile)).toBe(false);

    const index = JSON.parse(await readFile(path.join(root, 'sdloader-profile-index.json'), 'utf-8'));
    expect(index.packages.map((pkg: { name: string }) => pkg.name)).toEqual(['example.fhir.package#2.0.0']);
    expect(index.sourcePackages.map((pkg: { name: string }) => pkg.name).sort()).toEqual([
      'example.fhir.package#1.0.0',
      'example.fhir.package#2.0.0',
    ]);
    expect(index.profileUrls).toContain(latestProfile);
    expect(index.profileUrls).not.toContain(externalProfile);

    await rm(latestFile);

    const secondProfiles = new Set<string>();
    await scanCacheDirectory(root, secondProfiles);

    expect(secondProfiles.has(latestProfile)).toBe(true);
    expect(secondProfiles.has(oldProfile)).toBe(false);
  });
});

async function writeStructureDefinition(
  root: string,
  packageName: string,
  fileName: string,
  url: string,
): Promise<string> {
  const packageDir = path.join(root, packageName, 'package');
  await mkdir(packageDir, { recursive: true });
  const filePath = path.join(packageDir, fileName);
  await writeFile(
    filePath,
    JSON.stringify({
      resourceType: 'StructureDefinition',
      url,
      version: '1.0.0',
      fhirVersion: '4.0.1',
      type: 'Patient',
    }),
  );
  return filePath;
}
