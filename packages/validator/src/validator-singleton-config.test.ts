import { afterEach, describe, expect, it } from 'vitest';

import { resolveScopedProfileCacheMaxEntries } from './validator-singleton';

const ORIGINAL_CACHE_SIZE = process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES;

describe('scoped Records validator profile cache', () => {
  afterEach(() => {
    if (ORIGINAL_CACHE_SIZE === undefined) {
      delete process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES;
    } else {
      process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES = ORIGINAL_CACHE_SIZE;
    }
  });

  it('fits a prewarmed multi-profile run by default', () => {
    delete process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES;
    expect(resolveScopedProfileCacheMaxEntries()).toBe(192);
  });

  it('accepts a bounded deployment override', () => {
    process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES = '512';
    expect(resolveScopedProfileCacheMaxEntries()).toBe(512);

    process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES = '999999';
    expect(resolveScopedProfileCacheMaxEntries()).toBe(4_096);
  });
});
