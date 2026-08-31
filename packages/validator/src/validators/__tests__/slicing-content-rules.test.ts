import { describe, expect, it } from 'vitest';
import type { StructureDefinition } from '../../core/structure-definition-types';
import type { SliceDefinition } from '../slice-types';
import { validateSliceContentConstraints } from '../slicing-content-rules';

const practitionerProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'https://gematik.de/fhir/isik/StructureDefinition/ISiKPersonImGesundheitsberuf',
  name: 'ISiKPersonImGesundheitsberuf',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'Practitioner',
  snapshot: {
    element: [
      {
        id: 'Practitioner.identifier:Arztnummer.assigner.identifier.system',
        path: 'Practitioner.identifier.assigner.identifier.system',
        min: 1,
        max: '1',
        type: [{ code: 'uri' }],
        fixedUri: 'http://fhir.de/sid/arge-ik/iknr',
      },
    ],
  },
};

const practitionerIdentifierSlice: SliceDefinition = {
  sliceName: 'Arztnummer',
  path: 'Practitioner.identifier',
  min: 0,
  max: '1',
  childMin: new Map([['assigner.identifier.system', 1]]),
};

describe('slice content rules', () => {
  it('does not require descendants of an absent optional ancestor', () => {
    const issues = validateSliceContentConstraints(
      { system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR', value: '123456789' },
      practitionerIdentifierSlice,
      'Practitioner.identifier[0]',
      practitionerProfile,
    );

    expect(issues).toHaveLength(0);
  });

  it('requires a fixed child when all optional ancestors are present', () => {
    const issues = validateSliceContentConstraints(
      {
        system: 'https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR',
        value: '123456789',
        assigner: { identifier: {} },
      },
      practitionerIdentifierSlice,
      'Practitioner.identifier[0]',
      practitionerProfile,
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'structural-cardinality-min',
      path: 'Practitioner.identifier[0].assigner.identifier.system',
    }));
    expect(issues.filter(issue => issue.code === 'structural-cardinality-min')).toHaveLength(1);
  });

  it('checks a required child independently for every repeated parent', () => {
    const profile: StructureDefinition = {
      ...practitionerProfile,
      type: 'Observation',
      snapshot: {
        element: [{
          id: 'Observation.code:test.coding.code',
          path: 'Observation.code.coding.code',
          min: 1,
          max: '1',
        }],
      },
    };
    const slice: SliceDefinition = {
      sliceName: 'test',
      path: 'Observation.code',
      min: 0,
      max: '1',
      childMin: new Map([['coding.code', 1]]),
    };

    const issues = validateSliceContentConstraints(
      { coding: [{ code: 'valid' }, { system: 'https://example.org/system' }] },
      slice,
      'Observation.code',
      profile,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'structural-cardinality-min',
        path: 'Observation.code.coding[1].code',
      }),
    ]);
  });

  it('checks fixed constraints against every repeated value', () => {
    const profile: StructureDefinition = {
      ...practitionerProfile,
      type: 'Observation',
      snapshot: {
        element: [{
          id: 'Observation.code:test.coding.system',
          path: 'Observation.code.coding.system',
          min: 0,
          max: '1',
          fixedUri: 'https://example.org/expected',
        }],
      },
    };
    const slice: SliceDefinition = {
      sliceName: 'test',
      path: 'Observation.code',
      min: 0,
      max: '1',
    };

    const issues = validateSliceContentConstraints(
      {
        coding: [
          { system: 'https://example.org/expected' },
          { system: 'https://example.org/other' },
        ],
      },
      slice,
      'Observation.code',
      profile,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-slice-fixed-value-mismatch',
        path: 'Observation.code.coding[1].system',
      }),
    ]);
  });
});
