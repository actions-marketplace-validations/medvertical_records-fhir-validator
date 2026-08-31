import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminologyHierarchyValidator } from '../terminology-hierarchy-validator';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const axiosGet = vi.mocked(axios.get);

describe('TerminologyHierarchyValidator', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it('parses and defensively caches authoritative subsumption outcomes', async () => {
    axiosGet.mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'outcome', valueCode: 'subsumes' }],
      },
    });
    const validator = new TerminologyHierarchyValidator({
      serverUrl: 'https://tx.example.test/r4/',
    });

    const first = await validator.checkSnomedSubsumption('100', '200');
    first.related = false;
    const second = await validator.checkSnomedSubsumption('100', '200');

    expect(second).toEqual({
      outcome: 'subsumes',
      related: true,
      checkable: true,
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet).toHaveBeenCalledWith(
      'https://tx.example.test/r4/CodeSystem/$subsumes',
      expect.any(Object),
    );
  });

  it('bounds the per-instance terminology caches with LRU eviction', async () => {
    axiosGet.mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'outcome', valueCode: 'subsumes' }],
      },
    });
    const validator = new TerminologyHierarchyValidator({ maxCacheEntries: 1 });

    await validator.checkSnomedSubsumption('100', '200');
    await validator.checkSnomedSubsumption('300', '400');
    await validator.checkSnomedSubsumption('100', '200');

    expect(validator.getCacheStats().subsumption).toBe(1);
    expect(axiosGet).toHaveBeenCalledTimes(3);
  });

  it('does not turn missing or unknown outcomes into authoritative negatives', async () => {
    axiosGet
      .mockResolvedValueOnce({
        data: {
          resourceType: 'Parameters',
          parameter: [{ name: 'outcome' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          resourceType: 'Parameters',
          parameter: [{ name: 'outcome', valueCode: 'server-specific-value' }],
        },
      });
    const validator = new TerminologyHierarchyValidator();

    const missing = await validator.checkSnomedSubsumption('100', '200');
    const unknown = await validator.checkSnomedSubsumption('100', '200');

    expect(missing).toMatchObject({
      outcome: 'unknown',
      related: false,
      checkable: false,
    });
    expect(unknown).toMatchObject({
      outcome: 'unknown',
      related: false,
      checkable: false,
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('normalizes malformed lookup parts, deduplicates relations, and protects the cache', async () => {
    axiosGet.mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'display', valueString: 'Example concept' },
          {
            name: 'property',
            part: [
              null,
              { name: 'code', valueCode: 'parent' },
              { name: 'value', valueCode: 'PARENT' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: 'parent' },
              { name: 'value', valueCode: 'PARENT' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: 'child' },
              { name: 'value', valueCode: 'CHILD' },
            ],
          },
          42,
        ],
      },
    });
    const validator = new TerminologyHierarchyValidator();

    const first = await validator.getHierarchyInfo('CODE', 'http://example.org/system');
    first?.parents?.push('MUTATED');
    const second = await validator.getHierarchyInfo('CODE', 'http://example.org/system');

    expect(second).toEqual({
      code: 'CODE',
      system: 'http://example.org/system',
      display: 'Example concept',
      parents: ['PARENT'],
      children: ['CHILD'],
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it('fails open when the terminology server rejects the request', async () => {
    axiosGet.mockRejectedValue(new Error('network unavailable'));
    const validator = new TerminologyHierarchyValidator();

    await expect(validator.checkSnomedSubsumption('100', '200')).resolves.toMatchObject({
      outcome: 'unknown',
      related: false,
      checkable: false,
      error: 'Terminology server unavailable',
    });
    await expect(validator.getHierarchyInfo('CODE', 'http://example.org/system')).resolves.toBeNull();
  });

  it('validates ICD-10 category ranges without remote I/O', async () => {
    const validator = new TerminologyHierarchyValidator();

    await expect(validator.validateIcd10Hierarchy('E11.9', {
      requiredCategory: 'E10-E14',
      allowBillable: true,
    })).resolves.toMatchObject({
      isValid: true,
      checkable: true,
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
