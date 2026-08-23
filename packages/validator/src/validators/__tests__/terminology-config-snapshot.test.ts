import { describe, expect, it } from 'vitest';
import { snapshotTerminologyConfig } from '../terminology-config-snapshot';
import type { TerminologyResolutionConfig } from '../valueset-types';

describe('terminology configuration snapshots', () => {
  it('does not retain mutable auth, server, or policy references', () => {
    const input: TerminologyResolutionConfig = {
      strategy: 'server-first',
      serverUrl: 'https://tx.example.test/r4',
      auth: { type: 'bearer', token: 'initial-token' },
      servers: [{
        id: 'primary',
        url: 'https://tx.example.test/r4',
        enabled: true,
        fhirVersions: ['R4'],
        preferredSystems: ['http://loinc.org'],
        authConfig: { type: 'basic', username: 'user', password: 'initial-password' },
      }],
      serverDelegation: {
        expandValueSets: true,
        validateCodes: true,
        cacheResults: true,
        cacheTTLSeconds: 60,
        maxRemoteCodeSystemValidations: 2,
      },
    };
    const snapshot = snapshotTerminologyConfig(input);

    input.auth!.token = 'mutated-token';
    input.servers![0].preferredSystems!.push('http://snomed.info/sct');
    input.servers![0].authConfig!.password = 'mutated-password';
    input.serverDelegation!.maxRemoteCodeSystemValidations = 999;

    expect(snapshot.auth?.token).toBe('initial-token');
    expect(snapshot.servers?.[0].preferredSystems).toEqual(['http://loinc.org']);
    expect(snapshot.servers?.[0].authConfig?.password).toBe('initial-password');
    expect(snapshot.serverDelegation?.maxRemoteCodeSystemValidations).toBe(2);
  });
});
