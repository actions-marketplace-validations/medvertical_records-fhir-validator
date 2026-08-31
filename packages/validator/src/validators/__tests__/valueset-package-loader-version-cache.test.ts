import { describe, expect, it, vi } from 'vitest';

import { ValueSetCache } from '../valueset-cache';
import { ValueSetPackageLoader } from '../valueset-package-loader';
import type { CodeSystem } from '../valueset-types';

describe('versioned CodeSystem package caching', () => {
  it('does not replace the unversioned canonical with a version-specific load', async () => {
    const canonical = 'http://snomed.info/sct';
    const ukVersion = 'http://snomed.info/sct/999000041000000102/version/20250701';
    const internationalVersion = 'http://snomed.info/sct/900000000000207008/version/20250701';
    const codeSystem = (version: string, code: string): CodeSystem => ({
      resourceType: 'CodeSystem',
      url: canonical,
      version,
      content: 'complete',
      concept: [{ code }],
    });
    const findResource = vi.fn(async (
      _canonical: string,
      _names: string[],
      _resourceType: string,
      _preferredMajor?: string,
      requestedVersion?: string,
    ) => requestedVersion
      ? codeSystem(ukVersion, 'uk-only')
      : codeSystem(internationalVersion, 'international-only'));
    const cache = new ValueSetCache();
    const loader = new ValueSetPackageLoader(cache, {
      clear: vi.fn(),
      findResource,
      getPackageDirectories: vi.fn(() => []),
    } as never);

    await expect(loader.loadCodeSystem(canonical, '4', ukVersion))
      .resolves.toMatchObject({ version: ukVersion });
    expect(cache.getCodeSystem(canonical)).toBeUndefined();

    await expect(loader.loadCodeSystem(canonical, '4'))
      .resolves.toMatchObject({
        version: internationalVersion,
        concept: [{ code: 'international-only' }],
      });
    expect(findResource).toHaveBeenCalledTimes(2);
  });
});
