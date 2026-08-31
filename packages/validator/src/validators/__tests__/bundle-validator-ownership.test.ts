import { describe, expect, it, vi } from 'vitest';

import { logger } from '../../logger';
import { BundleValidator } from '../bundle-validator';

describe('BundleValidator rule ownership', () => {
  it('returns no issues for malformed or non-Bundle roots', async () => {
    const validator = new BundleValidator();

    await expect(validator.validateBundle(null)).resolves.toEqual([]);
    await expect(validator.validateBundle([])).resolves.toEqual([]);
    await expect(validator.validateBundle({ resourceType: Symbol('Bundle') }))
      .resolves.toEqual([]);
  });

  it('reports duplicate fullUrls only through the entry rule owner', async () => {
    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          fullUrl: 'https://example.test/fhir/Patient/p1',
          resource: { resourceType: 'Patient', id: 'p1' },
        },
        {
          fullUrl: 'https://example.test/fhir/Patient/p1',
          resource: { resourceType: 'Patient', id: 'p1' },
        },
      ],
    });

    expect(issues.filter(issue => issue.code === 'structural-bundle-fullurl-duplicate'))
      .toHaveLength(1);
    expect(issues.filter(issue => issue.code === 'duplicate-bundle-fullurl'))
      .toHaveLength(0);
  });

  it('reports unresolved document references only through the cross-entry owner', async () => {
    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'document',
      identifier: { system: 'https://example.test/doc', value: '1' },
      timestamp: '2026-07-26T00:00:00Z',
      entry: [{
        fullUrl: 'urn:uuid:composition',
        resource: {
          resourceType: 'Composition',
          id: 'composition',
          author: [{ reference: 'Practitioner/missing' }],
        },
      }],
    });

    expect(issues.filter(issue => issue.code === 'bundle-cross-entry-reference-missing'))
      .toEqual([
        expect.objectContaining({
          path: 'Bundle.entry[0].resource.author[0]',
          severity: 'error',
        }),
      ]);
    expect(issues.filter(issue => issue.code === 'unresolved-bundle-reference'))
      .toHaveLength(0);
  });

  it('keeps unresolved URN diagnostics for open Bundles without duplicating them', async () => {
    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        fullUrl: 'urn:uuid:patient',
        resource: {
          resourceType: 'Patient',
          id: 'patient',
          managingOrganization: { reference: 'urn:uuid:missing' },
        },
      }],
    });

    expect(issues.filter(issue => issue.code === 'bundle-cross-entry-reference-missing'))
      .toEqual([
        expect.objectContaining({
          path: 'Bundle.entry[0].resource.managingOrganization',
          severity: 'warning',
        }),
      ]);
    expect(issues.filter(issue => issue.code === 'unresolved-bundle-reference'))
      .toHaveLength(0);
  });

  it('skips malformed entries before invoking the entry validator', async () => {
    const entryValidator = vi.fn().mockResolvedValue([]);
    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        null,
        { resource: 42 },
        { resource: { resourceType: Symbol('Patient') } },
      ],
    }, entryValidator);

    expect(entryValidator).not.toHaveBeenCalled();
    expect(issues.some(issue => issue.code === 'bundle-validation-error')).toBe(false);
  });

  it('does not classify a present but invalid empty fullUrl as missing', async () => {
    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'document',
      identifier: { system: 'https://example.test/doc', value: '1' },
      timestamp: '2026-07-26T00:00:00Z',
      entry: [{
        fullUrl: '',
        resource: { resourceType: 'Composition', id: 'composition' },
      }],
    });

    expect(issues.filter(issue => issue.code === 'structural-bundle-fullurl-invalid'))
      .toHaveLength(1);
    expect(issues.filter(issue => issue.code === 'bundle-entry-missing-fullurl'))
      .toHaveLength(0);
    expect(issues.filter(issue => issue.code === 'ele-1-violation'))
      .toHaveLength(1);
  });

  it('surfaces one entry-validator failure and continues with later entries', async () => {
    const hostileThrowValue = {
      toString() {
        throw new Error('must not escape');
      },
    };
    const entryValidator = vi.fn(async (
      _resource: Record<string, unknown>,
      index: number,
    ) => {
      if (index === 0) throw hostileThrowValue;
      return [{
        aspect: 'structural',
        severity: 'error' as const,
        code: 'later-entry-issue',
        message: 'Later entry was still validated',
        path: 'Patient.name',
      }];
    });
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'p1' } },
        { resource: { resourceType: 'Patient', id: 'p2' } },
      ],
    };

    const first = await new BundleValidator().validateBundle(bundle, entryValidator);
    const second = await new BundleValidator().validateBundle(bundle, entryValidator);

    expect(first).toContainEqual(expect.objectContaining({
      aspect: 'profile',
      severity: 'error',
      code: 'bundle-entry-validation-error',
      message:
        'Bundle entry[0] validation could not be completed because the validator encountered an operational error.',
      path: 'Bundle.entry[0].resource',
    }));
    expect(first).toContainEqual(expect.objectContaining({
      code: 'later-entry-issue',
      path: 'Bundle.entry[1].resource.Patient.name',
    }));
    const firstFailure = first.find(issue => issue.code === 'bundle-entry-validation-error');
    const secondFailure = second.find(issue => issue.code === 'bundle-entry-validation-error');
    expect(firstFailure?.id).toBe(secondFailure?.id);
  });

  it('treats a malformed entry-validator result as visible incomplete validation', async () => {
    const entryValidator = vi.fn().mockResolvedValue({ issues: [] });

    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        resource: { resourceType: 'Patient', id: 'p1' },
      }],
    }, entryValidator as never);

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'bundle-entry-validation-error',
      message:
        'Bundle entry[0] validation could not be completed because the validator encountered an operational error.',
      path: 'Bundle.entry[0].resource',
    }));
  });

  it('does not expose entry-validator exception details in issues or logs', async () => {
    const sensitiveDetail =
      'https://user:secret@internal.example/fhir/Patient/p1?token=private';
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const issues = await new BundleValidator().validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        resource: { resourceType: 'Patient', id: 'p1' },
      }],
    }, async () => {
      throw new Error(sensitiveDetail);
    });

    expect(JSON.stringify(issues)).not.toContain(sensitiveDetail);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sensitiveDetail);
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'bundle-entry-validation-error',
      details: expect.objectContaining({
        entryIndex: 0,
        entryResourceType: 'Patient',
      }),
    }));

    warn.mockRestore();
  });

  it('does not expose outer Bundle-validator exception details', async () => {
    const sensitiveDetail = 'Authorization: Bearer private-token';
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const validator = new BundleValidator({
      getBundleType: () => 'collection',
      validateBundleStructure() {
        throw new Error(sensitiveDetail);
      },
    });

    const issues = await validator.validateBundle({
      resourceType: 'Bundle',
      type: 'collection',
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'bundle-validation-error',
      message:
        'Bundle validation could not be completed because the validator encountered an operational error.',
    }));
    expect(JSON.stringify(issues)).not.toContain(sensitiveDetail);
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveDetail);

    error.mockRestore();
  });
});
