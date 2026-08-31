import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('StructureDefinition auto-download architecture', () => {
  it('separates request state from remote source execution', () => {
    const orchestrator = readSource('sd-loader-auto-download.ts');
    const sources = readSource('sd-loader-auto-download-sources.ts');
    const externalSource = readSource('sd-loader-external-profile-source.ts');
    const packageSource = readSource('sd-loader-package-registry-source.ts');
    const downloadedProfileCache = readSource('sd-loader-downloaded-profile-cache.ts');

    expect(orchestrator).toMatch(
      /from ['"]\.\/sd-loader-auto-download-sources['"]/,
    );
    expect(orchestrator).not.toMatch(
      /detectPackageForProfile|downloadAndInstall|fetchExternalProfile|cacheDownloadedProfile/,
    );
    expect(sources).toContain('executeAutoDownload');
    expect(sources).toContain('tryExternalProfileSource');
    expect(sources).toContain('tryPackageRegistrySource');
    expect(sources).not.toMatch(
      /detectPackageForProfile|downloadAndInstall|fetchExternalProfile|cacheDownloadedProfile/,
    );
    expect(externalSource).toContain('fetchExternalProfile');
    expect(externalSource).toContain('settleWithin');
    expect(externalSource).not.toMatch(/detectPackageForProfile|downloadAndInstall/);
    expect(packageSource).toContain('detectPackageForProfile');
    expect(packageSource).toContain('downloadAndInstall');
    expect(packageSource).not.toMatch(/fetchExternalProfile|settleWithin/);
    expect(downloadedProfileCache).toContain('cacheDownloadedProfile');
    expect(downloadedProfileCache).toContain('sanitizeProfile');

    for (const source of [sources, externalSource, packageSource, downloadedProfileCache]) {
      expect(source).not.toMatch(
        /pendingRequests|notFoundCache|autoDownloadRequestKey|from ['"]\.\/sd-loader-auto-download['"]/,
      );
    }
  });
});
