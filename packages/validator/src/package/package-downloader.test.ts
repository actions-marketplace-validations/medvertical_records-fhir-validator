import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import * as tarStream from 'tar-stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageDownloader } from './package-downloader';

describe('PackageDownloader local cache resolution', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function writeInstalledPackage(cacheRoot: string, packageDirName: string, manifestName: string): Promise<void> {
    const packageDir = path.join(cacheRoot, packageDirName, 'package');
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: manifestName,
        version: packageDirName.split('#')[1],
        fhirVersions: ['4.0.1'],
      }),
    );
  }

  it('uses an already installed exact package before querying registries', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    await writeInstalledPackage(cacheRoot, 'hl7.fhir.eu.eps.r4#1.0.0-xtehr', 'hl7.fhir.eu.eps.r4');

    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => {
        throw new Error('registry should not be queried');
      },
    } as any);

    const result = await downloader.downloadAndInstall('hl7.fhir.eu.eps.r4', '1.0.0-xtehr');

    expect(result).toMatchObject({
      success: true,
      packageId: 'hl7.fhir.eu.eps.r4',
      version: '1.0.0-xtehr',
    });
    expect(result.path).toContain('hl7.fhir.eu.eps.r4#1.0.0-xtehr');
  });

  it('uses an installed FHIR-version-suffixed package for the unsuffixed IG id', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    await writeInstalledPackage(cacheRoot, 'hl7.fhir.eu.eps.r4#1.0.0-xtehr', 'hl7.fhir.eu.eps.r4');

    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => {
        throw new Error('registry should not be queried');
      },
    } as any);

    const result = await downloader.downloadAndInstall('hl7.fhir.eu.eps', '1.0.0-xtehr');

    expect(result).toMatchObject({
      success: true,
      packageId: 'hl7.fhir.eu.eps.r4',
      version: '1.0.0-xtehr',
    });
  });

  it('uses an installed stable FHIR-version-suffixed package for an unversioned IG id', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    await writeInstalledPackage(cacheRoot, 'hl7.fhir.uv.vulcan-schedule.r4#1.0.0', 'hl7.fhir.uv.vulcan-schedule.r4');

    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => {
        throw new Error('registry should not be queried');
      },
    } as any);

    const result = await downloader.downloadAndInstall('hl7.fhir.uv.vulcan-schedule');

    expect(result).toMatchObject({
      success: true,
      packageId: 'hl7.fhir.uv.vulcan-schedule.r4',
      version: '1.0.0',
    });
  });

  it('does not treat installed pre-release packages as latest for unversioned IG ids', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    await writeInstalledPackage(cacheRoot, 'hl7.fhir.uv.vulcan-schedule.r4#1.0.0-ballot', 'hl7.fhir.uv.vulcan-schedule.r4');
    let registryCalls = 0;

    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => {
        registryCalls++;
        return null;
      },
    } as any);

    const result = await downloader.downloadAndInstall('hl7.fhir.uv.vulcan-schedule');

    expect(registryCalls).toBe(1);
    expect(result).toMatchObject({
      success: false,
      packageId: 'hl7.fhir.uv.vulcan-schedule',
      version: 'unknown',
      error: 'Package not found in registry',
    });
  });

  it('shares concurrent downloads of the same package instead of returning in-progress errors', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    let registryCalls = 0;

    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => {
        registryCalls++;
        await new Promise(resolve => setTimeout(resolve, 25));
        return null;
      },
    } as any);

    const [first, second] = await Promise.all([
      downloader.downloadAndInstall('kbv.ita.for', '1.1.0'),
      downloader.downloadAndInstall('kbv.ita.for', '1.1.0'),
    ]);

    expect(registryCalls).toBe(1);
    expect(first).toMatchObject({
      success: false,
      packageId: 'kbv.ita.for',
      version: '1.1.0',
      error: 'Package not found in registry',
    });
    expect(second).toEqual(first);
  });

  it.each([
    ['../outside', '1.0.0'],
    ['hl7.fhir.test', '../outside'],
    ['hl7.fhir.test/path', '1.0.0'],
  ])('rejects unsafe package references before registry access', async (packageId, version) => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    const getPackageInfo = vi.fn();
    const downloader = new PackageDownloader(cacheRoot, { getPackageInfo } as any);

    await expect(downloader.downloadAndInstall(packageId, version)).resolves.toMatchObject({
      success: false,
      error: 'Invalid package identifier or version',
    });
    expect(getPackageInfo).not.toHaveBeenCalled();
  });

  it('rejects registry versions that cannot be contained in the package cache', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    const downloadPackageTarball = vi.fn();
    const downloader = new PackageDownloader(cacheRoot, {
      getPackageInfo: async () => ({
        packageId: 'hl7.fhir.test',
        version: '../outside',
        tarballUrl: 'https://packages.fhir.org/test',
      }),
      downloadPackageTarball,
    } as any);

    const result = await downloader.downloadAndInstall('hl7.fhir.test', '1.0.0');
    expect(result.success).toBe(false);
    expect(downloadPackageTarball).not.toHaveBeenCalled();
  });

  it('rejects archives whose manifest identity differs from the registry request', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    const archive = await createArchive([
      {
        name: 'package/package.json',
        content: JSON.stringify({ name: 'other.package', version: '1.0.0' }),
      },
    ]);
    const downloader = packageDownloaderForArchive(cacheRoot, archive);

    const result = await downloader.downloadAndInstall('hl7.fhir.test', '1.0.0');
    expect(result.success).toBe(false);
    await expect(access(path.join(cacheRoot, 'hl7.fhir.test#1.0.0'))).rejects.toThrow();
  });

  it('rejects archive traversal entries and leaves the parent directory untouched', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'records-packages-'));
    tempDirs.push(cacheRoot);
    const escapeName = `records-package-escape-${Date.now()}.txt`;
    const escapePath = path.join(path.dirname(cacheRoot), escapeName);
    const archive = await createArchive([
      { name: `../${escapeName}`, content: 'escape' },
      {
        name: 'package/package.json',
        content: JSON.stringify({ name: 'hl7.fhir.test', version: '1.0.0' }),
      },
    ]);
    const downloader = packageDownloaderForArchive(cacheRoot, archive);

    const result = await downloader.downloadAndInstall('hl7.fhir.test', '1.0.0');
    expect(result.success).toBe(false);
    await expect(access(escapePath)).rejects.toThrow();
  });
});

function packageDownloaderForArchive(cacheRoot: string, archive: Buffer): PackageDownloader {
  return new PackageDownloader(cacheRoot, {
    getPackageInfo: async () => ({
      packageId: 'hl7.fhir.test',
      version: '1.0.0',
      tarballUrl: 'https://packages.fhir.org/hl7.fhir.test/1.0.0',
    }),
    downloadPackageTarball: async () => archive,
  } as any);
}

async function createArchive(entries: Array<{ name: string; content: string }>): Promise<Buffer> {
  const pack = tarStream.pack();
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    pack.on('data', (chunk: Buffer) => chunks.push(chunk));
    pack.on('end', () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on('error', reject);
  });
  for (const entry of entries) pack.entry({ name: entry.name }, entry.content);
  pack.finalize();
  return complete;
}
