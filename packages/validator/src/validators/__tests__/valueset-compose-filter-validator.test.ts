import { afterEach, describe, expect, it } from 'vitest';
import { validateValueSetComposeFilters as validateWithCache } from '../valueset-compose-filter-validator';
import { ValueSetCache } from '../valueset-cache';

const valueSetCache = new ValueSetCache();
const validateValueSetComposeFilters = (entry: unknown, path: string) =>
  validateWithCache(entry, path, valueSetCache);

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

  it('accepts the standard implicit concept hierarchy filter', () => {
    valueSetCache.setCodeSystem('http://terminology.hl7.org/CodeSystem/v3-ActCode', {
      resourceType: 'CodeSystem',
      url: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      status: 'active',
      content: 'complete',
      hierarchyMeaning: 'is-a',
      property: [{ code: 'subsumedBy', type: 'code' }],
    });

    const issues = validateValueSetComposeFilters({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      filter: [{ property: 'concept', op: 'is-a', value: '_ActAccountCode' }],
    }, 'ValueSet.compose.include[0]');

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-property-unknown',
    }));
  });

  it('validates Coding property values against system(|version)#code format', () => {
    valueSetCache.setCodeSystem('http://example.org/CodeSystem/local', {
      resourceType: 'CodeSystem',
      url: 'http://example.org/CodeSystem/local',
      content: 'complete',
      property: [{ code: 'parentCoding', type: 'Coding' }],
    });

    const issues = validateValueSetComposeFilters({
      system: 'http://example.org/CodeSystem/local',
      filter: [{ property: 'parentCoding', op: '=', value: 'not-a-coding' }],
    }, 'ValueSet.compose.include[0]');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-value-format',
      severity: 'error',
    }));
  });

  it('skips malformed filter entries and continues validating later filters', () => {
    const issues = validateValueSetComposeFilters({
      filter: [
        null,
        [],
        { property: 'concept', op: 'invented-op', value: 'x' },
      ],
    }, 'ValueSet.compose.include[0]');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-op-invalid',
      path: 'ValueSet.compose.include[0].filter[2]',
    }));
  });

  it('returns no filter issues for malformed non-object entries', () => {
    expect(validateValueSetComposeFilters(null, 'ValueSet.compose.include[0]')).toEqual([]);
    expect(validateValueSetComposeFilters([], 'ValueSet.compose.include[0]')).toEqual([]);
  });
});
