import { afterEach, describe, expect, it, vi } from 'vitest';

describe('TerminologyApiClient ValueSet expansion', () => {
  afterEach(() => {
    vi.doUnmock('axios');
    vi.resetModules();
  });

  it('collects codes recursively from hierarchical server expansions', async () => {
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get: vi.fn().mockResolvedValue({
            data: {
              resourceType: 'ValueSet',
              expansion: {
                contains: [{
                  system: 'http://hl7.org/fhir/item-type',
                  code: 'question',
                  contains: [{
                    system: 'http://hl7.org/fhir/item-type',
                    code: 'decimal',
                  }],
                }],
              },
            },
          }),
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    const expansion = await client.expandValueSet('http://hl7.org/fhir/ValueSet/item-type');

    expect(expansion).toEqual(new Set([
      'question',
      'http://hl7.org/fhir/item-type|question',
      'decimal',
      'http://hl7.org/fhir/item-type|decimal',
    ]));
  });
});
