import { describe, expect, it, vi } from 'vitest';

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const UK_VERSION = 'http://snomed.info/sct/999000041000000102/version/20250701';
const INTERNATIONAL_VERSION =
  'http://snomed.info/sct/900000000000207008/version/20250701';

describe('Coding.version binding delegation', () => {
  it('routes only declared editions and isolates binding cache entries', async () => {
    vi.resetModules();
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }],
      },
    });
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: { ...actual.default, get },
        isAxiosError: actual.isAxiosError,
      };
    });
    const { ValueSetValidator } = await import('../valueset-validator');
    const validator = new ValueSetValidator();
    validator.setResolutionConfig({
      strategy: 'server-first',
      serverUrl: 'https://generic-snomed.example/fhir',
      servers: [
        {
          id: 'generic-snomed',
          url: 'https://generic-snomed.example/fhir',
          enabled: true,
          fhirVersions: ['R4'],
          preferredSystems: [SNOMED_SYSTEM],
        },
        {
          id: 'uk-edition',
          url: 'https://uk-snomed.example/fhir',
          enabled: true,
          fhirVersions: ['R4'],
          snomedEditions: ['999000041000000102'],
        },
      ],
      serverDelegation: {
        cacheResults: true,
        cacheTTLSeconds: 60,
        expandValueSets: false,
        validateCodes: true,
      },
      reportUnverifiedBindings: true,
      strictUnverifiedRequiredBindings: true,
    });
    const binding = {
      strength: 'required' as const,
      valueSet: 'http://example.org/ValueSet/version-routing',
    };

    await expect(validator.validateBinding(
      { system: SNOMED_SYSTEM, version: UK_VERSION, code: '35901911000001104' },
      binding,
      'Observation.code',
      { fhirVersion: 'R4' },
    )).resolves.toEqual([]);
    await expect(validator.validateBinding(
      {
        system: SNOMED_SYSTEM,
        version: INTERNATIONAL_VERSION,
        code: '35901911000001104',
      },
      binding,
      'Observation.code',
      { fhirVersion: 'R4' },
    )).resolves.toContainEqual(expect.objectContaining({
      code: 'terminology-binding-unverified',
    }));

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe(
      'https://uk-snomed.example/fhir/ValueSet/$validate-code',
    );
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      params: { system: SNOMED_SYSTEM, systemVersion: UK_VERSION },
    });
    vi.doUnmock('axios');
  });
});
