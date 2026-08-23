import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setProfileSource } from '../../persistence';
import { loadProfile, type LoadProfileContext } from '../sd-loader-load';
import type { StructureDefinition } from '../structure-definition-types';

describe('sd-loader loadProfile fallback behavior', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    setProfileSource({});
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('resolves tenant profiles before trusting a shared in-memory cache hit', async () => {
    const canonical = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-height';
    const globalProfile = {
      resourceType: 'StructureDefinition',
      id: 'global-v8',
      url: canonical,
      version: '8.0.0',
      type: 'Observation',
      fhirVersion: '4.0.1',
    } as StructureDefinition;
    const tenantProfile = { ...globalProfile, id: 'tenant-v7', version: '7.0.0' };
    const resolveProfile = vi.fn().mockResolvedValue(tenantProfile);
    setProfileSource({ resolveProfile });
    const ctx = makeScopedContext(canonical, globalProfile);

    await expect(loadProfile(ctx, canonical, 'R4')).resolves.toMatchObject({
      id: 'tenant-v7',
      version: '7.0.0',
    });
    expect(resolveProfile).toHaveBeenCalledWith(
      canonical,
      undefined,
      ctx.profileResolutionSettings,
      { organizationId: 17, serverId: 23, fhirVersion: 'R4' },
    );
  });

  it('fails the tenant lookup closed when only a shared cached profile exists', async () => {
    const canonical = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-height';
    const globalProfile = {
      resourceType: 'StructureDefinition',
      id: 'global-v8',
      url: canonical,
      version: '8.0.0',
      type: 'Observation',
      fhirVersion: '4.0.1',
    } as StructureDefinition;
    setProfileSource({ resolveProfile: vi.fn().mockResolvedValue(null) });

    await expect(loadProfile(makeScopedContext(canonical, globalProfile), canonical, 'R4'))
      .resolves.toBeNull();
  });

  it('fails the tenant lookup closed when the host has no scoped resolver capability', async () => {
    const canonical = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-height';
    const globalProfile = {
      resourceType: 'StructureDefinition',
      id: 'global-v8',
      url: canonical,
      version: '8.0.0',
      type: 'Observation',
      fhirVersion: '4.0.1',
    } as StructureDefinition;
    setProfileSource({});

    await expect(loadProfile(makeScopedContext(canonical, globalProfile), canonical, 'R4'))
      .resolves.toBeNull();
  });

  it('rejects a centrally resolved tenant profile from the wrong FHIR family', async () => {
    const canonical = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-height';
    const r5Profile = {
      resourceType: 'StructureDefinition',
      id: 'wrong-r5',
      url: canonical,
      version: '8.0.0',
      type: 'Observation',
      fhirVersion: '5.0.0',
    } as StructureDefinition;
    setProfileSource({ resolveProfile: vi.fn().mockResolvedValue(r5Profile) });

    await expect(loadProfile(makeScopedContext(canonical, r5Profile), canonical, 'R4'))
      .resolves.toBeNull();
  });

  it('rejects a centrally resolved tenant profile for another canonical', async () => {
    const canonical = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-height';
    const wrongProfile = {
      resourceType: 'StructureDefinition',
      id: 'wrong-canonical',
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      type: 'Patient',
      fhirVersion: '4.0.1',
    } as StructureDefinition;
    setProfileSource({ resolveProfile: vi.fn().mockResolvedValue(wrongProfile) });

    await expect(loadProfile(makeScopedContext(canonical, wrongProfile), canonical, 'R4'))
      .resolves.toBeNull();
  });

  it('rechecks an earlier public-source miss so newly synchronized profiles load', async () => {
    const canonical = 'https://example.test/fhir/StructureDefinition/DynamicPatient';
    const profile = {
      resourceType: 'StructureDefinition',
      id: 'dynamic-patient',
      url: canonical,
      type: 'Patient',
      fhirVersion: '4.0.1',
    } as StructureDefinition;
    const findByUrl = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(profile);
    setProfileSource({ findByUrl });
    const ctx: LoadProfileContext = {
      availableProfiles: new Set(),
      packageSources: [],
      cache: new Map(),
      profileLoadPromises: new Map(),
      autoDownload: false,
      registryClient: {} as any,
      packageDownloader: {} as any,
      allowedPackages: [],
      packageVersionPins: {},
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: false,
      },
      resolvePinnedCanonical: url => url,
    };

    await expect(loadProfile(ctx, canonical, 'R4')).resolves.toBeNull();
    await expect(loadProfile(ctx, canonical, 'R4')).resolves.toMatchObject({
      id: 'dynamic-patient',
      url: canonical,
    });
    expect(findByUrl).toHaveBeenCalledTimes(2);
  });

  it('continues to auto-download when an availableProfiles filesystem hit cannot be loaded', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'records-sd-loader-'));
    tempDirs.push(source);
    await mkdir(source, { recursive: true });

    const profileUrl = 'https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner|1.1.0';
    const sd: StructureDefinition = {
      resourceType: 'StructureDefinition',
      id: 'KBV-PR-FOR-Practitioner',
      url: 'https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner',
      version: '1.1.0',
      name: 'KBV_PR_FOR_Practitioner',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Practitioner',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Practitioner',
      derivation: 'constraint',
      fhirVersion: '4.0.1',
    };

    setProfileSource({
      fetchExternalProfile: async () => sd,
    });

    const ctx: LoadProfileContext = {
      availableProfiles: new Set([profileUrl]),
      packageSources: [source],
      cache: new Map(),
      profileLoadPromises: new Map(),
      autoDownload: true,
      registryClient: {
        detectPackageForProfile: async () => {
          throw new Error('registry should not be needed when external fallback succeeds');
        },
      } as any,
      packageDownloader: {
        downloadAndInstall: async () => {
          throw new Error('package download should not be needed when external fallback succeeds');
        },
      } as any,
      allowedPackages: ['kbv.ita.for'],
      packageVersionPins: {},
      profileSourcesConfig: {
        simplifier: true,
        packageRegistry: true,
      },
      resolvePinnedCanonical: url => url,
    };

    await expect(loadProfile(ctx, profileUrl, 'R4')).resolves.toMatchObject({
      url: sd.url,
      version: '1.1.0',
    });
  });

  it('loads explicitly versioned local profiles even when the deduped index only lists another package version', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'records-sd-loader-'));
    tempDirs.push(source);

    const requestedUrl = 'http://fhir.de/StructureDefinition/CodingICD10GM|1.3.2';
    const packageDir = path.join(source, 'de.basisprofil.r4#1.3.2', 'package');
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, 'StructureDefinition-CodingICD10GM.json'),
      JSON.stringify({
        resourceType: 'StructureDefinition',
        id: 'coding-icd10gm',
        url: 'http://fhir.de/StructureDefinition/CodingICD10GM',
        version: '1.3.2',
        name: 'CodingICD10GM',
        status: 'active',
        kind: 'complex-type',
        abstract: false,
        type: 'Coding',
        baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Coding',
        derivation: 'constraint',
        fhirVersion: '4.0.1',
      } satisfies StructureDefinition),
    );

    const ctx: LoadProfileContext = {
      availableProfiles: new Set([
        'http://fhir.de/StructureDefinition/CodingICD10GM',
        'http://fhir.de/StructureDefinition/CodingICD10GM|1.6.0',
      ]),
      packageSources: [source],
      cache: new Map(),
      profileLoadPromises: new Map(),
      autoDownload: false,
      registryClient: {} as any,
      packageDownloader: {} as any,
      allowedPackages: [],
      packageVersionPins: {},
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: false,
      },
      resolvePinnedCanonical: url => url,
    };

    await expect(loadProfile(ctx, requestedUrl, 'R4')).resolves.toMatchObject({
      url: 'http://fhir.de/StructureDefinition/CodingICD10GM',
      version: '1.3.2',
    });
  });
});

function makeScopedContext(
  canonical: string,
  globalProfile: StructureDefinition,
): LoadProfileContext {
  return {
    availableProfiles: new Set([canonical]),
    packageSources: [],
    cache: new Map([[`${canonical}:R4`, globalProfile]]),
    profileLoadPromises: new Map(),
    autoDownload: true,
    registryClient: {} as any,
    packageDownloader: {} as any,
    allowedPackages: [],
    packageVersionPins: {},
    profileSourcesConfig: { simplifier: true, packageRegistry: true },
    profileSourceContext: { organizationId: 17, serverId: 23, fhirVersion: 'R4' },
    profileResolutionSettings: { packageDownload: { autoDownload: true } } as any,
    resolvePinnedCanonical: url => url,
  };
}
