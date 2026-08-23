import { describe, expect, it } from 'vitest';
import {
  getDeclaredProfiles,
  getPrimaryDeclaredProfile,
} from '../declared-profile-utils';

describe('declared profile utilities', () => {
  it('accepts a single canonical without indexing it as a string', () => {
    const canonical = 'https://example.org/StructureDefinition/patient';

    expect(getPrimaryDeclaredProfile({
      meta: { profile: canonical },
    })).toBe(canonical);
  });

  it('filters malformed entries and deduplicates canonicals in order', () => {
    expect(getDeclaredProfiles({
      meta: {
        profile: [
          null,
          'https://example.org/StructureDefinition/one',
          42,
          '',
          'https://example.org/StructureDefinition/one',
          'https://example.org/StructureDefinition/two',
        ],
      },
    })).toEqual([
      'https://example.org/StructureDefinition/one',
      'https://example.org/StructureDefinition/two',
    ]);
  });

  it('returns no profiles for malformed resources and metadata', () => {
    expect(getDeclaredProfiles(null)).toEqual([]);
    expect(getDeclaredProfiles({ meta: [] })).toEqual([]);
    expect(getDeclaredProfiles({ meta: { profile: { canonical: 'invalid' } } })).toEqual([]);
  });
});
