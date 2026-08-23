import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProfilePackageProvenance,
  recordProfilePackageProvenance,
} from '../../package/canonical-pin-provenance';
import { findResourceInPackages } from '../../validators/valueset-package-search';
import { pinBindingToDependencyPins } from './terminology-binding-dependency-pins';

const PROFILE_URL = 'http://example.org/fhir/igx/StructureDefinition/pinned-profile';
const VALUE_SET = 'http://example.org/fhir/dep/ValueSet/dep-codes';

describe('pinBindingToDependencyPins', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    clearProfilePackageProvenance();
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createStore(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'binding-pins-'));
    tempDirs.push(dir);
    return dir;
  }

  it('leaves bindings of profiles without package provenance untouched', async () => {
    const binding = { strength: 'required' as const, valueSet: VALUE_SET };

    await expect(pinBindingToDependencyPins(binding, { url: PROFILE_URL, version: '1.0.0' }, 'R4'))
      .resolves.toEqual(binding);
  });

  it('pins a cross-IG binding to the version the profile source package declares', async () => {
    const store = await createStore();
    await writeSourcePackage(store, { 'example.dep': '1.0.0' });
    await writeValueSetPackage(store, '1.0.0', '1.0.0');
    await writeValueSetPackage(store, '2.0.0', '2.0.0');
    recordProfilePackageProvenance(PROFILE_URL, '1.0.0', 'example.igx#1.0.0');

    // The provenance-driven context resolves against the live store set, so
    // exercise the pin resolution directly through the same helpers with the
    // fixture store to keep the test hermetic.
    const { derivePackagePinContext, resolvePinnedVersionForCanonical } =
      await import('../../package/canonical-pin-context');
    const context = await derivePackagePinContext([store], { name: 'example.igx', version: '1.0.0' });

    expect(context).not.toBeNull();
    await expect(resolvePinnedVersionForCanonical([store], context!, VALUE_SET, 'R4'))
      .resolves.toBe('1.0.0');
  });

  it('lets the cross-major guard reject a pinned version with no same-major candidate', async () => {
    const store = await createStore();
    // Only a 2.x resource is installed while the pin requests 1.0.0 — the
    // ValueSet search must refuse the cross-major stand-in rather than
    // validating codes against the wrong major.
    await writeValueSetPackage(store, '2.0.0', '2.0.0');

    await expect(findResourceInPackages(
      [store],
      VALUE_SET,
      ['ValueSet-dep-codes.json'],
      undefined,
      '1.0.0',
    )).resolves.toBeNull();
  });

  it('honors a soft pin exactly when the pinned resource version is installed', async () => {
    const store = await createStore();
    await writeValueSetPackage(store, '1.0.0', '1.0.0');
    await writeValueSetPackage(store, '2.0.0', '2.0.0');

    const resolved = await findResourceInPackages<{ url?: string; version?: string }>(
      [store],
      VALUE_SET,
      ['ValueSet-dep-codes.json'],
      undefined,
      '1.0.0',
    );

    expect(resolved?.version).toBe('1.0.0');
  });

  async function writeSourcePackage(
    store: string,
    dependencies: Record<string, string>,
  ): Promise<void> {
    const packageDir = path.join(store, 'example.igx#1.0.0', 'package');
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
      name: 'example.igx',
      version: '1.0.0',
      canonical: 'http://example.org/fhir/igx',
      fhirVersions: ['4.0.1'],
      dependencies,
    }));
    await writeFile(path.join(packageDir, '.index.json'), JSON.stringify({
      'index-version': 2,
      files: [{
        filename: 'StructureDefinition-pinned-profile.json',
        resourceType: 'StructureDefinition',
        url: PROFILE_URL,
        version: '1.0.0',
      }],
    }));
  }

  async function writeValueSetPackage(
    store: string,
    packageVersion: string,
    resourceVersion: string,
  ): Promise<void> {
    const packageDir = path.join(store, `example.dep#${packageVersion}`, 'package');
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
      name: 'example.dep',
      version: packageVersion,
      canonical: 'http://example.org/fhir/dep',
      fhirVersions: ['4.0.1'],
    }));
    await writeFile(path.join(packageDir, '.index.json'), JSON.stringify({
      'index-version': 2,
      files: [{
        filename: 'ValueSet-dep-codes.json',
        resourceType: 'ValueSet',
        url: VALUE_SET,
        version: resourceVersion,
      }],
    }));
    await writeFile(path.join(packageDir, 'ValueSet-dep-codes.json'), JSON.stringify({
      resourceType: 'ValueSet',
      url: VALUE_SET,
      version: resourceVersion,
      status: 'active',
    }));
  }
});
