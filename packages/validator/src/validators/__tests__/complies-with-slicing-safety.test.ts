import { describe, expect, it } from 'vitest';

import {
  diffSlicing,
  indexSlicingParents,
} from '../complies-with-slicing';

function parent(
  path: string,
  rules: string,
  discriminators: Array<{ type: string; path: string }>,
) {
  return {
    id: path,
    path,
    slicing: { rules, discriminator: discriminators },
  };
}

function slice(
  id: string,
  path: string,
  sliceName: string,
  extra: Record<string, unknown> = {},
) {
  return { id, path, sliceName, min: 1, ...extra };
}

describe('complies-with slicing safety', () => {
  it('ignores malformed roots and discriminator declarations', () => {
    expect(indexSlicingParents(null).size).toBe(0);
    expect(indexSlicingParents({ element: [] }).size).toBe(0);

    const indexed = indexSlicingParents([
      null,
      parent('Patient.identifier', 'open', []),
      {
        id: 'Patient.telecom',
        path: 'Patient.telecom',
        slicing: { rules: Symbol('open'), discriminator: {} },
      },
    ]);

    expect(indexed.get('Patient.identifier')?.discriminators).toEqual([]);
    expect(indexed.get('Patient.telecom')).toMatchObject({
      rules: undefined,
      discriminators: [],
    });
  });

  it('does not match a same-named derived slice that lost discriminator evidence', () => {
    const base = [
      parent('Patient.identifier', 'open', [{ type: 'value', path: 'system' }]),
      slice('Patient.identifier:mrn', 'Patient.identifier', 'mrn'),
      {
        id: 'Patient.identifier:mrn.system',
        path: 'Patient.identifier.system',
        fixedUri: 'https://example.test/mrn',
      },
    ];
    const derived = [
      parent('Patient.identifier', 'open', [{ type: 'value', path: 'system' }]),
      slice('Patient.identifier:mrn', 'Patient.identifier', 'mrn'),
    ];

    expect(diffSlicing(base, derived)[0].missingRequiredSlices)
      .toEqual([
        expect.objectContaining({ id: 'Patient.identifier:mrn' }),
      ]);
  });

  it('matches boolean fixed values instead of dropping false', () => {
    const base = [
      parent('Patient.active', 'open', [{ type: 'value', path: '$this' }]),
      slice('Patient.active:inactive', 'Patient.active', 'inactive', {
        fixedBoolean: false,
      }),
    ];
    const derived = [
      parent('Patient.active', 'open', [{ type: 'value', path: '$this' }]),
      slice('Patient.active:inactive', 'Patient.active', 'inactive', {
        fixedBoolean: false,
      }),
    ];

    expect(diffSlicing(base, derived)[0].missingRequiredSlices).toEqual([]);
  });

  it('rejects partially resolved multi-discriminator evidence', () => {
    const discriminators = [
      { type: 'value', path: 'system' },
      { type: 'value', path: 'value' },
    ];
    const base = [
      parent('Patient.identifier', 'open', discriminators),
      slice('Patient.identifier:mrn', 'Patient.identifier', 'mrn'),
      {
        id: 'Patient.identifier:mrn.system',
        path: 'Patient.identifier.system',
        fixedUri: 'https://example.test/mrn',
      },
    ];
    const derived = structuredClone(base);

    expect(diffSlicing(base, derived)[0].missingRequiredSlices)
      .toHaveLength(1);
  });

  it('matches exists, type, and version-insensitive profile discriminators', () => {
    const base = [
      parent('Patient.identifier', 'open', [{ type: 'exists', path: 'value' }]),
      slice('Patient.identifier:valued', 'Patient.identifier', 'valued'),
      {
        id: 'Patient.identifier:valued.value',
        path: 'Patient.identifier.value',
        min: 1,
      },
      parent('Observation.value[x]', 'open', [{ type: 'type', path: '$this' }]),
      slice('Observation.value[x]:quantity', 'Observation.value[x]', 'quantity', {
        type: [{ code: 'Quantity' }],
      }),
      parent('Observation.subject', 'open', [{ type: 'profile', path: '$this' }]),
      slice('Observation.subject:patient', 'Observation.subject', 'patient', {
        type: [{
          code: 'Reference',
          targetProfile: ['https://example.test/Patient|1.0.0'],
        }],
      }),
    ];
    const derived = structuredClone(base);
    const profileType = (
      derived[6].type as Array<{ targetProfile: string[] }>
    )[0];
    profileType.targetProfile = ['https://example.test/Patient|2.0.0'];

    expect(diffSlicing(base, derived).flatMap(diff => diff.missingRequiredSlices))
      .toEqual([]);
  });

  it('recognizes openAtEnd to open as a rule relaxation', () => {
    const base = [
      parent('Patient.identifier', 'openAtEnd', []),
    ];
    const relaxed = [
      parent('Patient.identifier', 'open', []),
    ];
    const tightened = [
      parent('Patient.identifier', 'closed', []),
    ];

    expect(diffSlicing(base, relaxed)[0]).toMatchObject({
      rulesMismatchPath: 'Patient.identifier',
      rulesMismatchBase: 'openAtEnd',
      rulesMismatchDerived: 'open',
    });
    expect(diffSlicing(base, tightened)[0].rulesMismatchPath).toBeUndefined();
  });

  it('normalizes structured pattern property order', () => {
    const base = [
      parent('Patient.identifier', 'open', [{ type: 'pattern', path: '$this' }]),
      slice('Patient.identifier:mrn', 'Patient.identifier', 'mrn', {
        patternIdentifier: { system: 'https://example.test', value: '1' },
      }),
    ];
    const derived = [
      parent('Patient.identifier', 'open', [{ type: 'pattern', path: '$this' }]),
      slice('Patient.identifier:renamed', 'Patient.identifier', 'renamed', {
        patternIdentifier: { value: '1', system: 'https://example.test' },
      }),
    ];

    expect(diffSlicing(base, derived)[0].missingRequiredSlices).toEqual([]);
  });
});
