import { describe, expect, it } from 'vitest';
import { ValueSetValidator } from '../valueset-validator';
import type { TerminologyResolutionConfig } from '../valueset-types';

function createConfig(): TerminologyResolutionConfig {
  return {
    strategy: 'server-first',
    auth: {
      type: 'bearer',
      token: 'top-level-token',
    },
    servers: [{
      id: 'primary',
      url: 'https://terminology.example.test/fhir',
      enabled: true,
      fhirVersions: ['R4'],
      preferredSystems: ['http://loinc.org'],
      snomedEditions: ['999000041000000102'],
      authConfig: {
        type: 'bearer',
        token: 'server-token',
      },
    }],
    serverDelegation: {
      expandValueSets: true,
      validateCodes: true,
      cacheResults: true,
      cacheTTLSeconds: 60,
    },
    twoPhaseExpansion: {
      enabled: true,
      mode: 'shadow',
      logMismatches: true,
    },
  };
}

describe('ValueSetValidator resolution config ownership', () => {
  it('does not retain nested references supplied by the caller', () => {
    const validator = new ValueSetValidator();
    const input = createConfig();

    validator.setResolutionConfig(input);
    input.auth!.token = 'mutated';
    input.servers![0].fhirVersions.push('R5');
    input.servers![0].preferredSystems!.push('http://snomed.info/sct');
    input.servers![0].snomedEditions!.push('900000000000207008');
    input.servers![0].authConfig!.token = 'mutated';
    input.serverDelegation!.cacheTTLSeconds = 999;
    input.twoPhaseExpansion!.mode = 'enforce';

    expect(validator.getResolutionConfig()).toEqual(createConfig());
  });

  it('returns a detached snapshot that cannot mutate validator state', () => {
    const validator = new ValueSetValidator();
    validator.setResolutionConfig(createConfig());

    const snapshot = validator.getResolutionConfig();
    snapshot.auth!.token = 'mutated';
    snapshot.servers![0].fhirVersions.push('R6');
    snapshot.servers![0].preferredSystems![0] = 'mutated';
    snapshot.servers![0].snomedEditions![0] = 'mutated';
    snapshot.servers![0].authConfig!.token = 'mutated';
    snapshot.serverDelegation!.validateCodes = false;
    snapshot.twoPhaseExpansion!.enabled = false;

    expect(validator.getResolutionConfig()).toEqual(createConfig());
  });
});
