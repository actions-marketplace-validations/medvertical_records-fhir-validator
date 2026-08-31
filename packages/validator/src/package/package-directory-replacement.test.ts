import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  replaceInstalledPackageDirectory,
  type PackageDirectoryOperations,
} from './package-directory-replacement';

describe('replaceInstalledPackageDirectory', () => {
  const cachePath = '/tmp/records-package-replacement';
  const packageId = 'example.fhir';
  const version = '1.0.0';
  const targetPath = path.join(cachePath, `${packageId}#${version}`);
  const replacementPath = path.join(cachePath, `.temp-${packageId}-replacement`);
  const backupPath = path.join(cachePath, `.temp-${packageId}-backup-existing`);

  it('restores the previous package when activating the replacement fails', async () => {
    const operations = createOperations();
    operations.rename
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('rename failed'), { code: 'EIO' }))
      .mockResolvedValueOnce(undefined);

    await expect(replaceInstalledPackageDirectory({
      cachePath,
      packageId,
      version,
      replacementPath,
      operations,
    })).rejects.toMatchObject({ code: 'EIO' });

    expect(operations.rename.mock.calls).toEqual([
      [targetPath, backupPath],
      [replacementPath, targetPath],
      [backupPath, targetPath],
    ]);
  });

  it('reports a stable error if both replacement and rollback fail', async () => {
    const operations = createOperations();
    operations.rename
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rename failed'))
      .mockRejectedValueOnce(new Error('rollback failed'));

    await expect(replaceInstalledPackageDirectory({
      cachePath,
      packageId,
      version,
      replacementPath,
      operations,
    })).rejects.toThrow('Package replacement and rollback failed');
  });

  it('moves directly into place when no previous package exists', async () => {
    const operations = createOperations();
    operations.access.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    await replaceInstalledPackageDirectory({
      cachePath,
      packageId,
      version,
      replacementPath,
      operations,
    });

    expect(operations.mkdtemp).not.toHaveBeenCalled();
    expect(operations.rename).toHaveBeenCalledWith(replacementPath, targetPath);
  });

  function createOperations() {
    return {
      access: vi.fn<PackageDirectoryOperations['access']>().mockResolvedValue(undefined),
      mkdtemp: vi.fn<PackageDirectoryOperations['mkdtemp']>().mockResolvedValue(backupPath),
      rename: vi.fn<PackageDirectoryOperations['rename']>().mockResolvedValue(undefined),
      rm: vi.fn<PackageDirectoryOperations['rm']>().mockResolvedValue(undefined),
    };
  }
});
