import { afterEach, describe, expect, it } from 'vitest';
import { validateValueSetComposeFilters } from '../valueset-compose-filter-validator';
import { valueSetCache } from '../valueset-cache';

describe('ValueSet compose filter validation', () => {
  afterEach(() => valueSetCache.clear());

  it('does not treat cached partial metadata for terminology-server-only systems as authoritative', () => {
    valueSetCache.setCodeSystem('http://snomed.info/sct', {
      resourceType: 'CodeSystem',
      url: 'http://snomed.info/sct',
      status: 'active',
      content: 'fragment',
      property: [{ code: 'inactive', type: 'boolean' }],
    });

    const issues = validateValueSetComposeFilters({
      system: 'http://snomed.info/sct',
      filter: [{ property: 'constraint', op: '=', value: '234234 << 234234' }],
    }, 'ValueSet.compose.include[0]');

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-property-unknown',
    }));
  });

  it('still rejects unknown filter properties on authoritative local CodeSystems', () => {
    valueSetCache.setCodeSystem('http://example.org/CodeSystem/local', {
      resourceType: 'CodeSystem',
      url: 'http://example.org/CodeSystem/local',
      status: 'active',
      content: 'complete',
      property: [{ code: 'known', type: 'string' }],
    });

    const issues = validateValueSetComposeFilters({
      system: 'http://example.org/CodeSystem/local',
      filter: [{ property: 'unknown', op: '=', value: 'x' }],
    }, 'ValueSet.compose.include[0]');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-property-unknown',
      severity: 'error',
    }));
  });
});
