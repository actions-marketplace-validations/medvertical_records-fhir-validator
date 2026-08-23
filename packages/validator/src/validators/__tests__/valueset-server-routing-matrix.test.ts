import { describe, expect, it } from 'vitest';

import { DEFAULT_TERMINOLOGY_SERVERS } from '@records-fhir/validation-types';
import {
  getScopedExpansionCacheKey,
  resolveTerminologyServerForSystem,
} from '../valueset-server-routing';

describe('terminology server routing matrix', () => {
  it('keeps public Snowstorm opt-in while retaining an enabled R4 SNOMED-capable primary', () => {
    expect(DEFAULT_TERMINOLOGY_SERVERS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'csiro-ontoserver-r4',
        enabled: true,
        fhirVersions: ['R4'],
      }),
      expect.objectContaining({
        id: 'snowstorm-snomedtools',
        enabled: false,
        preferredSystems: ['http://snomed.info/sct'],
      }),
    ]));
  });

  it('skips an open SNOMED specialist circuit and falls back to the generic server', () => {
    const config = {
      strategy: 'server-first' as const,
      serverUrl: 'https://generic.example/fhir',
      servers: [{
        id: 'snowstorm',
        url: 'https://snowstorm.example/fhir',
        enabled: true,
        circuitOpen: true,
        preferredSystems: ['http://snomed.info/sct'],
      }],
    };

    expect(resolveTerminologyServerForSystem(config, 'http://snomed.info/sct')).toBeUndefined();
  });

  it('isolates expansion caches by FHIR version and endpoint configuration', () => {
    const base = {
      strategy: 'server-first' as const,
      serverUrl: 'https://a.example/fhir',
    };
    expect(getScopedExpansionCacheKey('http://example.org/ValueSet/x', base, 'R4'))
      .not.toBe(getScopedExpansionCacheKey(
        'http://example.org/ValueSet/x',
        { ...base, serverUrl: 'https://b.example/fhir' },
        'R4',
      ));
    expect(getScopedExpansionCacheKey('http://example.org/ValueSet/x', base, 'R4'))
      .not.toBe(getScopedExpansionCacheKey('http://example.org/ValueSet/x', base, 'R5'));
  });

  it('isolates expansion caches when remote expansion policy changes', () => {
    const base = {
      strategy: 'server-first' as const,
      serverUrl: 'https://a.example/fhir',
      serverDelegation: {
        cacheResults: true,
        cacheTTLSeconds: 60,
        expandValueSets: true,
        validateCodes: true,
      },
    };

    expect(getScopedExpansionCacheKey('http://example.org/ValueSet/x', base, 'R4'))
      .not.toBe(getScopedExpansionCacheKey(
        'http://example.org/ValueSet/x',
        {
          ...base,
          serverDelegation: { ...base.serverDelegation, expandValueSets: false },
        },
        'R4',
      ));
  });

  it('isolates expansion caches by credential scope without exposing credentials', () => {
    const base = {
      auth: { type: 'bearer' as const, token: 'tenant-a-secret' },
      serverUrl: 'https://shared.example/fhir',
      strategy: 'server-first' as const,
    };
    const firstKey = getScopedExpansionCacheKey('http://example.org/ValueSet/x', base, 'R4');
    const secondKey = getScopedExpansionCacheKey(
      'http://example.org/ValueSet/x',
      { ...base, auth: { type: 'bearer', token: 'tenant-b-secret' } },
      'R4',
    );

    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toContain('tenant-a-secret');
    expect(secondKey).not.toContain('tenant-b-secret');
  });
});
