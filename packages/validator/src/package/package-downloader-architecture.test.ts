import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/package', file), 'utf8');
}

describe('package downloader architecture', () => {
  it('keeps request and installation-target policy outside the downloader', () => {
    const downloader = readSource('package-downloader.ts');
    const policy = readSource('package-download-request-policy.ts');

    expect(downloader).toContain("from './package-download-request-policy.js'");
    expect(downloader).not.toMatch(/from ['"](?:node:)?(?:os|path)['"]/);
    expect(downloader).not.toMatch(
      /isSafePackageId|isSafePackageVersion|resolvePackageSizeLimit|resolveContainedPackagePath/,
    );
    expect(policy).toContain('resolvePackageDownloadRequest');
    expect(policy).toContain('resolvePackageInstallationTarget');
    expect(policy).toContain('resolveContainedPackagePath');
    expect(policy).toContain('getDefaultPackageCachePath');
  });
});
