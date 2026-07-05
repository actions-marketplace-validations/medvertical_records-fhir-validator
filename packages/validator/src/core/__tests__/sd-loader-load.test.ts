import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
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
      profileNotFound: new Set(),
      dbCacheNotFound: new Set(),
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
    expect(ctx.profileNotFound.size).toBe(0);
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
      profileNotFound: new Set(),
      dbCacheNotFound: new Set(),
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
    expect(ctx.profileNotFound.has(`${requestedUrl}:R4`)).toBe(false);
  });
});
