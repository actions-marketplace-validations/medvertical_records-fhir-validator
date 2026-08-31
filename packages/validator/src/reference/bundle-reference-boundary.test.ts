import { describe, expect, it } from 'vitest';
import { BundleReferenceResolver } from './bundle-reference-resolver';
import {
  extractBundleEntries,
  findReferencesInResource,
} from './bundle-reference-finder';

describe('Bundle reference boundaries', () => {
  it('normalizes malformed entries without losing their positions', () => {
    const entries = extractBundleEntries({
      resourceType: 'Bundle',
      entry: [null, 'invalid', { fullUrl: 7 }, { resource: { resourceType: 'Patient', id: 'p1' } }],
    });

    expect(entries).toHaveLength(4);
    expect(entries.slice(0, 3)).toEqual([{}, {}, {}]);
    expect(entries[3]?.resource).toMatchObject({ resourceType: 'Patient', id: 'p1' });
  });

  it('walks cyclic resources without recursion failure', () => {
    const resource: Record<string, unknown> = {
      subject: { reference: 'Patient/p1' },
    };
    resource.self = resource;

    expect(findReferencesInResource(resource)).toEqual([
      { reference: 'Patient/p1', fieldPath: 'subject.reference' },
    ]);
  });

  it('fails closed instead of silently dropping references beyond the traversal bound', () => {
    const resource = {
      extension: Array.from({ length: 20_001 }, () => ({})),
      subject: { reference: 'Patient/after-boundary' },
    };

    expect(() => findReferencesInResource(resource)).toThrow(
      expect.objectContaining({ code: 'FHIR_TRAVERSAL_LIMIT' }),
    );
  });

  it('does not resolve an entry that has a matching fullUrl but no resource', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [{ fullUrl: 'Patient/p1' }],
    };

    expect(new BundleReferenceResolver().resolveBundleReference('Patient/p1', bundle))
      .toMatchObject({ resolved: false });
  });

  it('handles malformed resource metadata during fullUrl validation', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        fullUrl: 'https://example.org/fhir/Patient/p1',
        resource: { resourceType: 'Patient', id: 'p1', meta: 'invalid' },
      }, null],
    };

    expect(new BundleReferenceResolver().validateBundleReferences(bundle))
      .toMatchObject({ totalEntries: 2 });
  });
});
