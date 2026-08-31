import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../logger';
import { validateBundleEntryResources } from '../validator-bundle-entry-validation';
import { validateRecordsResource } from '../validator-single-resource-validation';
import { validateResourceStructure } from '../validator-structure-validation';

const hostileThrowValue = {
  toString() {
    throw new Error('must not escape the validation boundary');
  },
};

describe('core validator error boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps single-resource fallback creation safe for hostile throw values', async () => {
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const resource = {
      get resourceType(): never {
        throw hostileThrowValue;
      },
    };
    const context = {
      sdLoader: {
        setProfileResolutionContext: vi.fn(),
      },
    };

    const first = await validateRecordsResource({
      resource,
      profileUrl: 'http://example.org/StructureDefinition/test',
      fhirVersion: 'R4',
    }, context as never);
    const second = await validateRecordsResource({
      resource,
      profileUrl: 'http://example.org/StructureDefinition/test',
      fhirVersion: 'R4',
    }, context as never);

    expect(first[0]).toMatchObject({
      code: 'validation-error',
      message:
        'Validation could not be completed because the validator encountered an operational error.',
      schemaVersion: 'R4',
    });
    expect(first[0]?.id).toBe(second[0]?.id);
    expect(logError).toHaveBeenCalledWith(
      '[RecordsValidator] Validation failed',
      { failureKind: 'unknown' },
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(
      'must not escape the validation boundary',
    );
  });

  it('keeps structural fallback creation safe for hostile throw values', async () => {
    const resource = {
      get resourceType(): never {
        throw hostileThrowValue;
      },
    };

    const issues = await validateResourceStructure(
      resource,
      'R5',
      0,
      {} as never,
    );

    expect(issues[0]).toMatchObject({
      code: 'validation-error',
      message:
        'Structure validation could not be completed because the validator encountered an operational error.',
      schemaVersion: 'R5',
    });
  });

  it('returns a visible stable issue when one Bundle entry validator throws', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        resource: {
          resourceType: 'Patient',
          id: 'p1',
        },
      }],
    };
    const deps = {
      sdLoader: {
        loadProfile: vi.fn().mockResolvedValue(null),
      },
      profileCache: {
        get: vi.fn(),
        set: vi.fn(),
      },
      snapshotGenerator: {},
      maxDepth: 3,
      structuralExecutor: {
        validateResourceIdAndArrays: vi.fn().mockReturnValue([]),
      },
      validateResource: vi.fn().mockRejectedValue(hostileThrowValue),
      validateNestedBundleEntries: vi.fn().mockResolvedValue([]),
    };

    const first = await validateBundleEntryResources(
      bundle,
      'R4',
      0,
      deps as never,
    );
    const second = await validateBundleEntryResources(
      bundle,
      'R4',
      0,
      deps as never,
    );

    expect(first).toContainEqual(expect.objectContaining({
      code: 'validation-error',
      message:
        'Bundle entry[0] validation could not be completed because the validator encountered an operational error.',
      path: 'Bundle.entry[0].resource',
      details: {
        entryIndex: 0,
        resourceType: 'Patient',
      },
    }));
    expect(first[0]?.id).toBe(second[0]?.id);
  });
});
