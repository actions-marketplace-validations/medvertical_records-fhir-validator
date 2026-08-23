import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyResourcePinToCanonical,
  deriveResourcePinContext,
  resolvePinnedVersionForCanonical,
} from './canonical-pin-context';

const IG_CANONICAL = 'http://example.org/fhir/igx';
const DEP_PROFILE = 'http://example.org/fhir/dep/StructureDefinition/dep-profile';
const OWN_PROFILE = `${IG_CANONICAL}/StructureDefinition/own-profile`;
const SHARED_PROFILE = 'http://example.org/fhir/shared/StructureDefinition/shared-profile';

const igxSample = { url: `${IG_CANONICAL}/Questionnaire/sample`, version: '1.0.0' };

describe('canonical pin context', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createStore(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'canonical-pins-'));
    tempDirs.push(dir);
    return dir;
  }

  it('resolves an unversioned canonical to the version the owning IG pins', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' });
    await writePackage(store, 'example.dep', '1.0.0', [{ url: DEP_PROFILE, version: '1.0.0' }]);
    await writePackage(store, 'example.dep', '2.0.0', [{ url: DEP_PROFILE, version: '2.0.0' }]);

    await expect(applyResourcePinToCanonical([store], igxSample, DEP_PROFILE))
      .resolves.toBe(`${DEP_PROFILE}|1.0.0`);
  });

  it('keeps current behavior when the owning IG declares no matching pin', async () => {
    const store = await createStore();
    await writeIgxPackage(store, {});
    await writePackage(store, 'example.dep', '2.0.0', [{ url: DEP_PROFILE, version: '2.0.0' }]);

    await expect(applyResourcePinToCanonical([store], igxSample, DEP_PROFILE))
      .resolves.toBe(DEP_PROFILE);
  });

  it('keeps current behavior when the pinned package version is not installed', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '3.0.0' });
    await writePackage(store, 'example.dep', '2.0.0', [{ url: DEP_PROFILE, version: '2.0.0' }]);

    await expect(applyResourcePinToCanonical([store], igxSample, DEP_PROFILE))
      .resolves.toBe(DEP_PROFILE);
  });

  it('prefers the owning IG itself over a pinned dependency shipping the same canonical', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' }, [
      { url: OWN_PROFILE, version: '1.0.0' },
    ]);
    await writePackage(store, 'example.dep', '1.0.0', [{ url: OWN_PROFILE, version: '9.9.9' }]);

    await expect(applyResourcePinToCanonical([store], igxSample, OWN_PROFILE))
      .resolves.toBe(`${OWN_PROFILE}|1.0.0`);
  });

  it('resolves multi-IG conflicts in the declared dependency order', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.first': '1.0.0', 'example.second': '1.0.0' });
    await writePackage(store, 'example.first', '1.0.0', [{ url: SHARED_PROFILE, version: '1.1.0' }]);
    await writePackage(store, 'example.second', '1.0.0', [{ url: SHARED_PROFILE, version: '1.2.0' }]);

    await expect(applyResourcePinToCanonical([store], igxSample, SHARED_PROFILE))
      .resolves.toBe(`${SHARED_PROFILE}|1.1.0`);
  });

  it('never rewrites core FHIR canonicals or already-versioned canonicals', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' });
    await writePackage(store, 'example.dep', '1.0.0', [{ url: DEP_PROFILE, version: '1.0.0' }]);

    await expect(applyResourcePinToCanonical(
      [store], igxSample, 'http://hl7.org/fhir/StructureDefinition/Questionnaire',
    )).resolves.toBe('http://hl7.org/fhir/StructureDefinition/Questionnaire');
    await expect(applyResourcePinToCanonical([store], igxSample, `${DEP_PROFILE}|2.0.0`))
      .resolves.toBe(`${DEP_PROFILE}|2.0.0`);
  });

  it('derives no context for resources without a canonical identity', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' });

    await expect(deriveResourcePinContext([store], { resourceType: 'Patient', id: 'p1' }))
      .resolves.toBeNull();
    await expect(deriveResourcePinContext([store], { url: igxSample.url }))
      .resolves.toBeNull();
  });

  it('requires the artifact version to match the owning package version', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' });

    await expect(deriveResourcePinContext(
      [store], { url: igxSample.url, version: '9.0.0' },
    )).resolves.toBeNull();
  });

  it('skips pinned packages of a different FHIR version family', async () => {
    const store = await createStore();
    await writeIgxPackage(store, { 'example.dep': '1.0.0' });
    await writePackage(store, 'example.dep', '1.0.0', [{ url: DEP_PROFILE, version: '1.0.0' }], {
      fhirVersions: ['5.0.0'],
    });
    const context = await deriveResourcePinContext([store], igxSample);

    expect(context).not.toBeNull();
    await expect(resolvePinnedVersionForCanonical([store], context!, DEP_PROFILE, 'R4'))
      .resolves.toBeNull();
  });

  async function writeIgxPackage(
    store: string,
    dependencies: Record<string, string>,
    extraIndexEntries: Array<{ url: string; version: string }> = [],
  ): Promise<void> {
    await writePackage(store, 'example.igx', '1.0.0', [
      { url: igxSample.url, version: igxSample.version },
      ...extraIndexEntries,
    ], { canonical: IG_CANONICAL, dependencies });
  }
});

async function writePackage(
  store: string,
  name: string,
  version: string,
  indexEntries: Array<{ url: string; version: string }>,
  manifestExtras: Record<string, unknown> = {},
): Promise<void> {
  const packageDir = path.join(store, `${name}#${version}`, 'package');
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
    name,
    version,
    fhirVersions: ['4.0.1'],
    ...manifestExtras,
  }));
  await writeFile(path.join(packageDir, '.index.json'), JSON.stringify({
    'index-version': 2,
    files: indexEntries.map((entry, position) => ({
      filename: `resource-${position}.json`,
      resourceType: 'StructureDefinition',
      url: entry.url,
      version: entry.version,
    })),
  }));
}
