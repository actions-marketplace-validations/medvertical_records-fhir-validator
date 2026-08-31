import { describe, expect, it } from 'vitest';

import { buildUnverifiableCodeSystemResult } from '../valueset-code-system-rules';

const CODE_UNKNOWN = { valid: false, reason: 'code-unknown' as const };

describe('SNOMED CodeSystem unverifiable diagnostics', () => {
  it('treats a matching edition declaration as authoritative without preferredSystems', () => {
    const result = buildUnverifiableCodeSystemResult(
      '123456',
      'http://snomed.info/sct',
      CODE_UNKNOWN,
      {
        strategy: 'server-first',
        servers: [{
          id: 'uk-edition',
          url: 'https://snomed.example/fhir',
          enabled: true,
          snomedEditions: ['999000041000000102'],
        }],
      },
      'http://snomed.info/sct/999000041000000102/version/20250701',
    );

    expect(result).toBeNull();
  });

  it('names the requested national edition when no authoritative server matches it', () => {
    const result = buildUnverifiableCodeSystemResult(
      '123456',
      'http://snomed.info/sct',
      CODE_UNKNOWN,
      {
        strategy: 'server-first',
        servers: [{
          id: 'international',
          url: 'https://snomed.example/fhir',
          enabled: true,
          preferredSystems: ['http://snomed.info/sct'],
          snomedEditions: ['900000000000207008'],
        }],
      },
      'http://snomed.info/sct/999000041000000102/version/20250701',
    );

    expect(result).toMatchObject({
      valid: false,
      reason: 'system-unresolvable',
    });
    expect(result?.message).toContain("requested edition '999000041000000102'");
    expect(result?.message).not.toContain('unversioned');
  });

  it('does not treat a matching edition server for another FHIR release as authoritative', () => {
    const result = buildUnverifiableCodeSystemResult(
      '123456',
      'http://snomed.info/sct',
      CODE_UNKNOWN,
      {
        strategy: 'server-first',
        servers: [{
          id: 'uk-r4',
          url: 'https://snomed.example/fhir',
          enabled: true,
          fhirVersions: ['R4'],
          snomedEditions: ['999000041000000102'],
        }],
      },
      'http://snomed.info/sct/999000041000000102/version/20250701',
      'R5',
    );

    expect(result).toMatchObject({
      valid: false,
      reason: 'system-unresolvable',
    });
  });

  it('retains the unversioned guidance when Coding.version is absent', () => {
    const result = buildUnverifiableCodeSystemResult(
      '123456',
      'http://snomed.info/sct',
      CODE_UNKNOWN,
      { strategy: 'server-first' },
    );

    expect(result?.message).toContain('authoritative unversioned SNOMED edition');
  });
});
