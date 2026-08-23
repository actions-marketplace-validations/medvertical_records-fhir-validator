import { describe, expect, it, vi } from 'vitest';
import { RecursiveReferenceValidator } from '../recursive-reference-validator';

describe('RecursiveReferenceValidator', () => {
  it('resolves Bundle-internal urn:uuid references before reporting unresolved references', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'urn:uuid:composition-1',
          resource: {
            resourceType: 'Composition',
            id: 'composition-1',
            status: 'final',
            subject: { reference: 'urn:uuid:patient-1' },
          },
        },
        {
          fullUrl: 'urn:uuid:patient-1',
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
          },
        },
      ],
    };

    const result = await new RecursiveReferenceValidator().validateRecursively(bundle, {
      enabled: true,
      maxDepth: 2,
      maxReferencesPerResource: 10,
    });

    expect(result.unresolvedReferences).toEqual([]);
    expect(result.referencesFollowed).toBeGreaterThan(0);
  });

  it('resolves Bundle-internal relative references before reporting unresolved references', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'urn:uuid:composition-1',
          resource: {
            resourceType: 'Composition',
            id: 'composition-1',
            status: 'final',
            subject: { reference: 'Patient/patient-1' },
          },
        },
        {
          fullUrl: 'urn:uuid:patient-1',
          resource: {
            resourceType: 'Patient',
            id: 'patient-1',
          },
        },
      ],
    };

    const result = await new RecursiveReferenceValidator().validateRecursively(bundle, {
      enabled: true,
      maxDepth: 2,
      maxReferencesPerResource: 10,
    });

    expect(result.unresolvedReferences).toEqual([]);
    expect(result.referencesFollowed).toBeGreaterThan(0);
  });

  it('does not report a Bundle entry Provenance target pointing at the enclosing Bundle as circular', async () => {
    const bundle = {
      resourceType: 'Bundle',
      id: 'bundle-1',
      type: 'batch',
      entry: [
        {
          fullUrl: 'urn:uuid:provenance-1',
          resource: {
            resourceType: 'Provenance',
            id: 'provenance-1',
            target: [{ reference: 'Bundle/bundle-1' }],
          },
        },
      ],
    };

    const result = await new RecursiveReferenceValidator().validateRecursively(bundle, {
      enabled: true,
      maxDepth: 2,
      maxReferencesPerResource: 10,
    });

    expect(result.circularReferences).toEqual([]);
  });

  it('clamps unsafe numeric configuration values', () => {
    const config = new RecursiveReferenceValidator().createSafeConfig({
      enabled: true,
      maxDepth: 99,
      maxReferencesPerResource: -5,
      timeoutMs: -1,
    });

    expect(config).toMatchObject({
      maxDepth: 3,
      maxReferencesPerResource: 1,
      timeoutMs: 1,
    });
    expect(new RecursiveReferenceValidator().createSafeConfig({ maxDepth: Number.NaN }).maxDepth)
      .toBe(1);
  });

  it('returns detached default configuration arrays', () => {
    const validator = new RecursiveReferenceValidator();
    validator.getDefaultConfig().excludeResourceTypes!.push('Patient');
    expect(validator.getDefaultConfig().excludeResourceTypes).toEqual([]);
  });

  it('fetches duplicate references only once per resource', async () => {
    const fetcher = vi.fn(async () => ({ resourceType: 'Patient', id: 'p1' }));
    const result = await new RecursiveReferenceValidator().validateRecursively({
      resourceType: 'Observation',
      id: 'o1',
      subject: { reference: 'Patient/p1' },
      performer: [{ reference: 'Patient/p1' }],
    }, { enabled: true, maxDepth: 2 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.referencesFollowed).toBe(1);
  });

  it('enforces the configured deadline around a hanging fetcher', async () => {
    const result = await new RecursiveReferenceValidator().validateRecursively({
      resourceType: 'Observation',
      id: 'o1',
      subject: { reference: 'Patient/p1' },
    }, { enabled: true, maxDepth: 2, timeoutMs: 5 }, async () => new Promise(() => {}));

    expect(result.timedOut).toBe(true);
    expect(result.unresolvedReferences).toEqual(['Patient/p1']);
  });

  it('treats scalar fetch responses as unresolved', async () => {
    const result = await new RecursiveReferenceValidator().validateRecursively({
      resourceType: 'Observation',
      id: 'o1',
      subject: { reference: 'Patient/p1' },
    }, {
      enabled: true,
      maxDepth: 2,
    }, async () => 'not-a-resource');

    expect(result.referencesFollowed).toBe(0);
    expect(result.unresolvedReferences).toEqual(['Patient/p1']);
  });

  it('recognizes the same id-less object across recursive visits', async () => {
    const resource = {
      subject: { reference: 'Patient/p1' },
    };
    const result = await new RecursiveReferenceValidator().validateRecursively(
      resource,
      { enabled: true, maxDepth: 3 },
      async () => resource,
    );

    expect(result.totalResourcesValidated).toBe(1);
    expect(result.referencesFollowed).toBe(1);
  });
});
