import { describe, expect, it } from 'vitest';
import {
  isAllowedPackageTarballUrl,
  isSafePackageArchiveEntry,
  isIgnorablePackageArchiveMetadata,
  isSafePackageArchivePath,
  isSafePackageId,
  isSafePackageVersion,
  packageErrorMetadata,
  packageReferenceMetadata,
  packageTargetMetadata,
  resolvePackageSizeLimit,
} from './package-artifact-policy.js';

describe('package artifact policy', () => {
  it('accepts FHIR package identifiers and rejects path/control syntax', () => {
    expect(isSafePackageId('hl7.fhir.uv.ips')).toBe(true);
    expect(isSafePackageId('UK.Core.r4-v2')).toBe(true);
    expect(isSafePackageId('../outside')).toBe(false);
    expect(isSafePackageId('package/name')).toBe(false);
    expect(isSafePackageId('package#1.0.0')).toBe(false);
    expect(isSafePackageId('package..name')).toBe(false);
  });

  it('recognizes bounded AppleDouble metadata without allowing arbitrary root files', () => {
    expect(isIgnorablePackageArchiveMetadata('._package', 'File', 163)).toBe(true);
    expect(isIgnorablePackageArchiveMetadata('package/._package.json', 'File', 512)).toBe(true);
    expect(isIgnorablePackageArchiveMetadata('__MACOSX/package/._profile.json', 'File', 512)).toBe(true);
    expect(isIgnorablePackageArchiveMetadata('profile.json', 'File', 512)).toBe(false);
    expect(isIgnorablePackageArchiveMetadata('../._package', 'File', 512)).toBe(false);
  });

  it('accepts exact package versions and rejects path/control syntax', () => {
    expect(isSafePackageVersion('1.0.0-xtehr+build.1')).toBe(true);
    expect(isSafePackageVersion('current')).toBe(true);
    expect(isSafePackageVersion('../outside')).toBe(false);
    expect(isSafePackageVersion('1.0.0/path')).toBe(false);
    expect(isSafePackageVersion('1.0.0#other')).toBe(false);
  });

  it('allows only trusted HTTPS package tarball origins', () => {
    expect(isAllowedPackageTarballUrl('https://packages.fhir.org/pkg/1.0.0')).toBe(true);
    expect(isAllowedPackageTarballUrl('https://packages.simplifier.net/pkg/-/pkg-1.0.0.tgz')).toBe(true);
    expect(isAllowedPackageTarballUrl('https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz')).toBe(true);
    expect(isAllowedPackageTarballUrl('http://packages.fhir.org/pkg/1.0.0')).toBe(false);
    expect(isAllowedPackageTarballUrl('https://packages.fhir.org.evil.test/pkg.tgz')).toBe(false);
    expect(isAllowedPackageTarballUrl('https://127.0.0.1/pkg.tgz')).toBe(false);
    expect(isAllowedPackageTarballUrl('https://user:pass@packages.fhir.org/pkg.tgz')).toBe(false);
  });

  it('restricts archive entries to non-traversing package paths', () => {
    expect(isSafePackageArchivePath('package/package.json')).toBe(true);
    expect(isSafePackageArchivePath('package/StructureDefinition-a.json')).toBe(true);
    expect(isSafePackageArchivePath('../outside')).toBe(false);
    expect(isSafePackageArchivePath('package/../../outside')).toBe(false);
    expect(isSafePackageArchivePath('/package/package.json')).toBe(false);
    expect(isSafePackageArchivePath('other/package.json')).toBe(false);
    expect(isSafePackageArchivePath('package\\..\\outside')).toBe(false);
    expect(isSafePackageArchiveEntry('package/link', 'SymbolicLink', 0)).toBe(false);
    expect(isSafePackageArchiveEntry('package/link', 'symlink', 0)).toBe(false);
    expect(isSafePackageArchiveEntry('package/link', 'link', 0)).toBe(false);
    expect(isSafePackageArchiveEntry('package/large.bin', 'File', 257 * 1024 * 1024)).toBe(false);
  });

  it('bounds caller-configured package sizes', () => {
    expect(resolvePackageSizeLimit()).toBe(500 * 1024 * 1024);
    expect(resolvePackageSizeLimit(1)).toBe(1);
    expect(resolvePackageSizeLimit(0)).toBeNull();
    expect(resolvePackageSizeLimit(Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolvePackageSizeLimit(1024 * 1024 * 1024 + 1)).toBeNull();
  });

  it('uses opaque stable references for package and profile logging', () => {
    const packageMetadata = packageReferenceMetadata('private.enterprise.package', '1.2.3');
    const targetMetadata = packageTargetMetadata('https://tenant.example/StructureDefinition/private');

    expect(packageMetadata.packageRef).toMatch(/^[a-f0-9]{16}$/);
    expect(targetMetadata.targetRef).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify({ packageMetadata, targetMetadata })).not.toContain('private');
    expect(packageReferenceMetadata('private.enterprise.package', '1.2.3')).toEqual(packageMetadata);
  });

  it('reduces arbitrary errors to bounded operational metadata', () => {
    const filesystemError = Object.assign(new Error('/secret/cache/path'), { code: 'ENOENT' });

    expect(packageErrorMetadata(filesystemError)).toEqual({ kind: 'filesystem', code: 'ENOENT' });
    expect(packageErrorMetadata(new SyntaxError('secret registry body'))).toEqual({ kind: 'syntax' });
    expect(packageErrorMetadata(new Error('https://user:pass@example.test'))).toEqual({ kind: 'unknown' });
  });
});
