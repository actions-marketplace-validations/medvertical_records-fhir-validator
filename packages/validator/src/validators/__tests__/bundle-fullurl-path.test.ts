import { describe, expect, it } from 'vitest';
import { validateBundleFullUrlPresence } from '../bundle-type-rules';

// The defect corpus (quality-corpus/r4/generated/bundle-entry-missing-fullurl)
// matches this exact path — a drift here silently costs recall instead of
// failing this suite.
describe('validateBundleFullUrlPresence path contract', () => {
  it('warns at Bundle.entry[i].fullUrl for a collection entry with a resource but no fullUrl', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'Patient', id: 'p1' } }],
    };

    const issues = validateBundleFullUrlPresence(bundle, 'collection');

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'bundle-entry-missing-fullurl',
      severity: 'warning',
      path: 'Bundle.entry[0].fullUrl',
    });
  });

  it('emits nothing when the collection entry carries a fullUrl', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        fullUrl: 'urn:uuid:0c3151bd-1cbf-4d64-b04d-cd9187a4c6e0',
        resource: { resourceType: 'Patient', id: 'p1' },
      }],
    };

    expect(validateBundleFullUrlPresence(bundle, 'collection')).toEqual([]);
  });
});
