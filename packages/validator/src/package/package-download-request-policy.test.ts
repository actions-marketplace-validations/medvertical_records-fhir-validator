import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_PACKAGE_BYTES } from './package-artifact-policy';
import {
  resolvePackageDownloadRequest,
  resolvePackageInstallationTarget,
} from './package-download-request-policy';

describe('package download request policy', () => {
  it('resolves a valid forced request with a normalized matching cache path', () => {
    expect(resolvePackageDownloadRequest(
      'hl7.fhir.r4.core',
      '4.0.1',
      '/tmp/records-packages',
      {
        cachePath: '/tmp/records-packages/./',
        force: true,
      },
    )).toEqual({
      accepted: true,
      lockKey: 'hl7.fhir.r4.core#4.0.1',
      options: {
        force: true,
        maxPackageSize: DEFAULT_MAX_PACKAGE_BYTES,
      },
    });
  });

  it.each([
    ['../outside', '4.0.1'],
    ['hl7.fhir.r4.core', '../outside'],
    ['hl7.fhir.r4.core/path', '4.0.1'],
  ])('rejects unsafe package references', (packageId, version) => {
    expect(resolvePackageDownloadRequest(
      packageId,
      version,
      '/tmp/records-packages',
      {},
    )).toEqual({
      accepted: false,
      error: 'Invalid package identifier or version',
    });
  });

  it('rejects mismatched cache paths and invalid package-size limits', () => {
    expect(resolvePackageDownloadRequest(
      'hl7.fhir.r4.core',
      '4.0.1',
      '/tmp/records-packages',
      { cachePath: '/tmp/other-packages' },
    )).toEqual({
      accepted: false,
      error: 'Per-call cache path does not match downloader cache path',
    });
    expect(resolvePackageDownloadRequest(
      'hl7.fhir.r4.core',
      '4.0.1',
      '/tmp/records-packages',
      { maxPackageSize: 0 },
    )).toEqual({
      accepted: false,
      error: 'Invalid package size limit',
    });
  });

  it('resolves only registry identities matching the requested safe target', () => {
    expect(resolvePackageInstallationTarget(
      '/tmp/records-packages',
      'hl7.fhir.r4.core',
      'hl7.fhir.r4.core',
      '4.0.1',
    )).toBe('/tmp/records-packages/hl7.fhir.r4.core#4.0.1');

    expect(() => resolvePackageInstallationTarget(
      '/tmp/records-packages',
      'hl7.fhir.r4.core',
      'other.fhir.package',
      '4.0.1',
    )).toThrow('Registry returned an invalid package identity');
    expect(() => resolvePackageInstallationTarget(
      '/tmp/records-packages',
      'hl7.fhir.r4.core',
      'hl7.fhir.r4.core',
      '../outside',
    )).toThrow('Registry returned an invalid package identity');
  });
});
