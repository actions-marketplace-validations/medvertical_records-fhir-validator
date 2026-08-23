import { describe, expect, it } from 'vitest';

import {
  buildReferenceIndexes,
  resolveReferenceInBundle,
} from '../bundle-cross-entry-reference-resolution';
import { validateBundleCrossEntryReferences } from '../bundle-cross-entry-references';
import { extractReferencesWithPaths } from '../bundle-reference-utils';

describe('bundle cross-entry reference safety', () => {
  it('contains cyclic resources and skips malformed entries', () => {
    const resource: Record<string, unknown> = {
      resourceType: 'Patient',
      id: 'source',
      managingOrganization: {
        reference: 'Organization/missing',
      },
    };
    resource.loop = resource;

    const issues = validateBundleCrossEntryReferences({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        null,
        42,
        { fullUrl: 99, resource },
      ],
    }, 'document');

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'bundle-cross-entry-reference-missing',
        path: 'Bundle.entry[2].resource.managingOrganization',
      }),
    ]);
  });

  it('extracts a shared reference at each concrete path without following cycles', () => {
    const shared = { reference: 'Patient/p1' };
    const resource: Record<string, unknown> = {
      subject: shared,
      performer: [shared],
    };
    resource.loop = resource;
    const hits: Array<{ reference: string; path: string }> = [];

    extractReferencesWithPaths(resource, '', hits);

    expect(hits).toEqual([
      { reference: 'Patient/p1', path: 'subject' },
      { reference: 'Patient/p1', path: 'performer[0]' },
    ]);
  });

  it('indexes only usable entry fields and preserves type/id match diagnostics', () => {
    const entries = [
      null,
      { fullUrl: 42, resource: { resourceType: 'Patient', id: 'p1' } },
      { resource: { resourceType: 'Patient', id: 'p1' } },
      { request: { url: 42 } },
    ];
    const indexes = buildReferenceIndexes(entries);
    const resolved = resolveReferenceInBundle(
      'Patient/p1',
      'Patient/p1',
      undefined,
      indexes,
    );

    expect(indexes.fullUrlIndex.size).toBe(0);
    expect(resolved).toMatchObject({
      resolvable: false,
      hasTypeIdMatch: true,
      multipleMatches: true,
      matchCount: 2,
    });
  });

  it('returns no issues for malformed bundle roots', () => {
    expect(validateBundleCrossEntryReferences(null, null)).toEqual([]);
    expect(validateBundleCrossEntryReferences({ entry: {} }, null)).toEqual([]);
  });
});
