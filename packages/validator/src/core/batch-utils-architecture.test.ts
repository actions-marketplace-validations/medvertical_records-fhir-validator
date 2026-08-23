import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('batch utility architecture', () => {
  it('keeps the compatibility surface free of implementation responsibilities', () => {
    const facade = readSource('batch-utils.ts');
    const resourcePlanning = readSource('batch-resource-planning.ts');
    const profilePreloader = readSource('profile-batch-preloader.ts');
    const cacheWarmup = readSource('profile-cache-warmup.ts');

    expect(facade).toContain("from './batch-resource-planning'");
    expect(facade).toContain("from './profile-batch-preloader'");
    expect(facade).toContain("from './profile-cache-warmup'");
    expect(facade).not.toMatch(/createHash|loadProfilesBatch|warmupRecent/);
    expect(resourcePlanning).toContain('deduplicateResources');
    expect(resourcePlanning).toContain('groupResourcesByProfile');
    expect(resourcePlanning).not.toMatch(/ProfileCache|SnapshotGenerator|warmupRecent/);
    expect(profilePreloader).toContain('preloadProfiles');
    expect(profilePreloader).not.toMatch(/createHash|inferCodeBasedProfiles|warmupRecent/);
    expect(cacheWarmup).toContain('warmupProfileCacheFromDatabase');
    expect(cacheWarmup).toContain('warmupRecent');
    expect(cacheWarmup).not.toMatch(/loadProfilesBatch|SnapshotGenerator|createHash/);
  });
});
