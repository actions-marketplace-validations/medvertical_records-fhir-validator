import { beforeEach, describe, expect, it } from 'vitest';
import { attemptAutoDownload, clearAllCaches } from './sd-loader-auto-download';

describe('attemptAutoDownload package pins', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  it('passes pinned package versions to the downloader', async () => {
    let requestedVersion: string | undefined;

    const result = await attemptAutoDownload('https://example.org/fhir/StructureDefinition/PinnedProfile', {
      registryClient: {
        detectPackageForProfile: async () => 'de.medizininformatikinitiative.kerndatensatz.laborbefund'
      } as any,
      packageDownloader: {
        downloadAndInstall: async (_packageId: string, version?: string) => {
          requestedVersion = version;
          return {
            success: true,
            packageId: _packageId,
            version: version ?? 'latest',
            installedPath: '/tmp/records-fhir-validator-test'
          };
        }
      } as any,
      allowedPackages: ['de.medizininformatikinitiative.*'],
      packageVersionPins: {
        'de.medizininformatikinitiative.kerndatensatz.laborbefund': '2026.0.1'
      },
      packageSources: ['/tmp/records-fhir-validator-test'],
      cache: new Map(),
      availableProfiles: new Set(),
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: true
      },
      fhirVersion: 'R4'
    });

    expect(result).toBeNull();
    expect(requestedVersion).toBe('2026.0.1');
  });

  it('uses explicit canonical versions as the package version when no pin exists', async () => {
    let requestedVersion: string | undefined;

    const result = await attemptAutoDownload('https://fhir.kbv.de/StructureDefinition/KBV_PR_EAU_Bundle|1.1.0', {
      registryClient: {
        detectPackageForProfile: async () => 'kbv.ita.eau'
      } as any,
      packageDownloader: {
        downloadAndInstall: async (_packageId: string, version?: string) => {
          requestedVersion = version;
          return {
            success: true,
            packageId: _packageId,
            version: version ?? 'latest',
            installedPath: '/tmp/records-fhir-validator-test'
          };
        }
      } as any,
      allowedPackages: ['kbv.ita.eau'],
      packageSources: ['/tmp/records-fhir-validator-test'],
      cache: new Map(),
      availableProfiles: new Set(),
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: true
      },
      fhirVersion: 'R4'
    });

    expect(result).toBeNull();
    expect(requestedVersion).toBe('1.1.0');
  });

  it('does not auto-download FHIR-version-incompatible canonical URLs', async () => {
    let registryCalls = 0;

    const result = await attemptAutoDownload(
      'http://hl7.org/fhir/5.0/StructureDefinition/extension-Observation.value',
      {
        registryClient: {
          detectPackageForProfile: async () => {
            registryCalls++;
            return 'hl7.fhir.uv.xver-r5.r4.r4';
          },
        } as any,
        packageDownloader: {
          downloadAndInstall: async () => {
            throw new Error('should not download');
          },
        } as any,
        allowedPackages: ['hl7.fhir.uv.xver-r5.r4.r4'],
        packageSources: ['/tmp/records-fhir-validator-test'],
        cache: new Map(),
        availableProfiles: new Set(),
        profileSourcesConfig: {
          simplifier: false,
          packageRegistry: true,
        },
        fhirVersion: 'R4',
      },
    );

    expect(result).toBeNull();
    expect(registryCalls).toBe(0);
  });

  it('scope-caches generic vendor hosts when no package candidate is found', async () => {
    let registryCalls = 0;

    const context = {
      registryClient: {
        detectPackageForProfile: async () => {
          registryCalls++;
          return null;
        },
      } as any,
      packageDownloader: {
        downloadAndInstall: async () => {
          throw new Error('should not download');
        },
      } as any,
      allowedPackages: ['*'],
      packageSources: ['/tmp/records-fhir-validator-test'],
      cache: new Map(),
      availableProfiles: new Set(),
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: true,
      },
      fhirVersion: 'R4' as const,
    };

    await expect(attemptAutoDownload(
      'https://emr-core.beda.software/StructureDefinition/help-text',
      context,
    )).resolves.toBeNull();
    await expect(attemptAutoDownload(
      'https://emr-core.beda.software/StructureDefinition/inline-choice-direction',
      context,
    )).resolves.toBeNull();

    expect(registryCalls).toBe(1);
  });

  it('keeps known package namespaces out of generic scope caching', async () => {
    let registryCalls = 0;

    const context = {
      registryClient: {
        detectPackageForProfile: async () => {
          registryCalls++;
          return null;
        },
      } as any,
      packageDownloader: {
        downloadAndInstall: async () => {
          throw new Error('should not download');
        },
      } as any,
      allowedPackages: ['*'],
      packageSources: ['/tmp/records-fhir-validator-test'],
      cache: new Map(),
      availableProfiles: new Set(),
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: true,
      },
      fhirVersion: 'R4' as const,
    };

    await expect(attemptAutoDownload(
      'http://hl7.org/fhir/us/core/StructureDefinition/MissingA',
      context,
    )).resolves.toBeNull();
    await expect(attemptAutoDownload(
      'http://hl7.org/fhir/us/core/StructureDefinition/MissingB',
      context,
    )).resolves.toBeNull();

    expect(registryCalls).toBe(2);
  });

  it('does not scope-cache when a package candidate was detected', async () => {
    let registryCalls = 0;

    const context = {
      registryClient: {
        detectPackageForProfile: async () => {
          registryCalls++;
          return 'example.fhir.package';
        },
      } as any,
      packageDownloader: {
        downloadAndInstall: async (packageId: string) => ({
          success: true,
          packageId,
          version: '1.0.0',
          installedPath: '/tmp/records-fhir-validator-test',
        }),
      } as any,
      allowedPackages: ['*'],
      packageSources: ['/tmp/records-fhir-validator-test'],
      cache: new Map(),
      availableProfiles: new Set(),
      profileSourcesConfig: {
        simplifier: false,
        packageRegistry: true,
      },
      fhirVersion: 'R4' as const,
    };

    await expect(attemptAutoDownload(
      'https://example.org/fhir/StructureDefinition/MissingA',
      context,
    )).resolves.toBeNull();
    await expect(attemptAutoDownload(
      'https://example.org/fhir/StructureDefinition/MissingB',
      context,
    )).resolves.toBeNull();

    expect(registryCalls).toBe(2);
  });
});
