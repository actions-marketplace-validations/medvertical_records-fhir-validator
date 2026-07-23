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
  });
});
