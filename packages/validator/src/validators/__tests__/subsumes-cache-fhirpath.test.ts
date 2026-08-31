import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubsumesFunction } from '../fhirpath-custom-functions';
import { TerminologyOperationCache } from '../terminology-operation-cache';
import { ValueSetCache } from '../valueset-cache';

const SNOMED = 'http://snomed.info/sct';

describe('FHIRPath subsumes cache integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('axios');
  });

  it('returns undetermined when no $subsumes result has been warmed', () => {
    const result = createSubsumesFunction().fn(
      [{ system: SNOMED, code: '404684003' }],
      [{ system: SNOMED, code: '22298006' }],
    );

    expect(result).toEqual([]);
  });

  it('uses cached $subsumes outcomes warmed by the terminology client', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'outcome', valueCode: 'subsumes' }],
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

    const { TerminologyApiClient } =
      await import('../terminology-api-client');

    const operationCache = new TerminologyOperationCache();
    const warmedSubsumesFunction = createSubsumesFunction(operationCache);
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example/fhir',
      strategy: 'server-first',
    }, new ValueSetCache(), operationCache);

    await expect(client.subsumes(SNOMED, '404684003', '22298006')).resolves.toBe('subsumes');
    expect(operationCache.getStats().subsumesResultCount).toBe(1);

    const result = warmedSubsumesFunction.fn(
      [{ system: SNOMED, code: '404684003' }],
      [{ system: SNOMED, code: '22298006' }],
    );

    expect(result).toEqual([true]);
  });

  it('exposes non-subsumed outcomes without failing open', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'outcome', valueCode: 'not-subsumed' }],
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

    const { TerminologyApiClient } =
      await import('../terminology-api-client');

    const operationCache = new TerminologyOperationCache();
    const warmedSubsumesFunction = createSubsumesFunction(operationCache);
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example/fhir',
      strategy: 'server-first',
    }, new ValueSetCache(), operationCache);

    await client.subsumes(SNOMED, '404684003', '22298006');

    expect(operationCache.findSubsumesBySuffix(
      `|${SNOMED}|404684003|22298006`,
    )).toBe('not-subsumed');
    expect(warmedSubsumesFunction.fn(
      [{ system: SNOMED, code: '404684003' }],
      [{ system: SNOMED, code: '22298006' }],
    )).toEqual([false]);
    expect(operationCache.getStats().subsumesResultCount).toBe(1);
  });
});
