import { describe, expect, it } from 'vitest';

import { createBundleReferenceResolver } from '../multi-aspect-bundle-reference-resolver';

describe('EPS reference resolution matrix', () => {
  const patient = { resourceType: 'Patient', id: 'p1' };
  const bundle = {
    resourceType: 'Bundle',
    entry: [{
      fullUrl: 'https://records.example/fhir/Patient/p1',
      resource: patient,
    }],
  };

  it.each([
    ['relative', 'Patient/p1'],
    ['absolute', 'https://records.example/fhir/Patient/p1'],
    ['cross-origin absolute', 'https://other.example/base/Patient/p1'],
    ['versioned absolute', 'https://other.example/base/Patient/p1/_history/7'],
  ])('resolves %s references within the Bundle', (_label, reference) => {
    expect(createBundleReferenceResolver(bundle, bundle)?.(reference)).toBe(patient);
  });

  it('returns null for an unresolved Bundle reference', () => {
    expect(createBundleReferenceResolver(bundle, bundle)?.('Patient/missing')).toBeNull();
  });

  it('keeps contained references scoped to their containing resource', () => {
    const contained = { resourceType: 'Organization', id: 'org1' };
    const composition = { resourceType: 'Composition', contained: [contained] };
    expect(createBundleReferenceResolver(bundle, composition)?.('#org1')).toBe(contained);
  });
});
