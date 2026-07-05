import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageRegistryClient } from './package-registry-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PackageRegistryClient package detection', () => {
  it('maps Da Vinci PDEX Plan-Net canonicals to the Plan-Net package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/plannet-PractitionerRole'),
    ).resolves.toBe('hl7.fhir.us.davinci-pdex-plan-net');
  });

  it('maps Da Vinci PDEX canonicals to the PDEX package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/us/davinci-pdex/StructureDefinition/pdex-device'),
    ).resolves.toBe('hl7.fhir.us.davinci-pdex');
  });

  it('maps Da Vinci CRD canonicals to the CRD package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/us/davinci-crd/R4/StructureDefinition/profile-devicerequest-r4'),
    ).resolves.toBe('hl7.fhir.us.davinci-crd');
  });

  it('maps HL7 SDC canonicals to the SDC package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaireresponse'),
    ).resolves.toBe('hl7.fhir.uv.sdc');
  });

  it('maps generic HL7 UV canonicals to their IG package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/uv/vulcan-schedule/StructureDefinition/SOA-PlanDefinition'),
    ).resolves.toBe('hl7.fhir.uv.vulcan-schedule');

    await expect(
      client.detectPackageForProfile('http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'),
    ).resolves.toBe('hl7.fhir.uv.ips');
  });

  it('resolves short canonical package versions to published SemVer package versions', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      name: 'hl7.fhir.uv.sdc',
      'dist-tags': { latest: '4.0.0' },
      versions: {
        '2.7.0': {
          name: 'hl7.fhir.uv.sdc',
          version: '2.7.0',
          fhirVersion: '4.0.1',
          dist: { tarball: 'https://example.test/hl7.fhir.uv.sdc-2.7.0.tgz' },
        },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new PackageRegistryClient();

    await expect(
      client.getPackageInfo('hl7.fhir.uv.sdc', '2.7'),
    ).resolves.toMatchObject({
      packageId: 'hl7.fhir.uv.sdc',
      version: '2.7.0',
      tarballUrl: 'https://example.test/hl7.fhir.uv.sdc-2.7.0.tgz',
    });
  });

  it('maps Nictiz NL R4 canonicals to the nl-core package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://nictiz.nl/fhir/StructureDefinition/zib-BodyTemperature'),
    ).resolves.toBe('nictiz.fhir.nl.r4.nl-core');
  });

  it('maps KBV EAU canonicals to the EAU package before the KBV basis fallback', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('https://fhir.kbv.de/StructureDefinition/KBV_PR_EAU_Bundle|1.1.0'),
    ).resolves.toBe('kbv.ita.eau');

    await expect(
      client.detectPackageForProfile('https://fhir.kbv.de/StructureDefinition/KBV_EX_EAU_7_weeks'),
    ).resolves.toBe('kbv.ita.eau');
  });

  it('maps KBV FOR canonicals to the FOR package before the KBV basis fallback', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner|1.1.0'),
    ).resolves.toBe('kbv.ita.for');
  });

  it('maps Australian eRequesting canonicals before the AU base fallback', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.org.au/fhir/ereq/StructureDefinition/au-erequesting-displaysequence'),
    ).resolves.toBe('hl7.fhir.au.ereq');
  });

  it('maps HL7 Europe EPS canonicals to the R4 package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.eu/fhir/eps/StructureDefinition/bundle-eu-eps'),
    ).resolves.toBe('hl7.fhir.eu.eps.r4');
  });

  it('maps HL7 Europe base canonicals to the EU base package id', async () => {
    const client = new PackageRegistryClient();

    await expect(
      client.detectPackageForProfile('http://hl7.eu/fhir/base/StructureDefinition/flag-patient-eu-core'),
    ).resolves.toBe('hl7.fhir.eu.base');
  });
});

describe('PackageRegistryClient manifest cache', () => {
  it('bounds manifest cache size and refreshes recently used entries', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const packageId = url.split('/').pop() || 'unknown';
      return new Response(JSON.stringify({
        name: packageId,
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: packageId,
            version: '1.0.0',
            dist: { tarball: `https://example.test/${packageId}.tgz` },
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new PackageRegistryClient(1000, 2);

    await client.fetchPackageManifest('package-a');
    await client.fetchPackageManifest('package-b');
    await client.fetchPackageManifest('package-a');
    await client.fetchPackageManifest('package-c');

    expect(client.getCacheStats()).toEqual(expect.objectContaining({
      size: 2,
      maxSize: 2,
      packageIds: ['package-a', 'package-c'],
      hits: 1,
      misses: 3,
      evictions: 1,
      staleEvictions: 0,
    }));

    await client.fetchPackageManifest('package-b');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
