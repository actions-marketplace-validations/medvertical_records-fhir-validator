import { describe, expect, it } from 'vitest';
import { ConstraintValidator } from '../constraint-validator';
import { validateSliceTypeProfileConstraints } from '../slicing-type-profile-constraints';
import type { SliceDefinition } from '../slice-types';
import type { StructureDefinition } from '../../core/structure-definition-types';

// Modelled on de.basisprofil.r4 gender-amtlich-de: the extension profile's
// invariant reads the CONTAINING resource through %resource. Regression for
// the profiled-precision FP where the slice value itself was bound as
// %resource and `%resource.where(gender='other')` came back empty.
const genderExtensionProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://example.org/StructureDefinition/gender-amtlich-de',
  name: 'GenderAmtlichDe',
  status: 'active',
  kind: 'complex-type',
  abstract: false,
  type: 'Extension',
  snapshot: {
    element: [
      { id: 'Extension', path: 'Extension' },
      {
        id: 'Extension.value[x]',
        path: 'Extension.value[x]',
        constraint: [{
          key: 'gender-amtlich-1',
          severity: 'error',
          human: 'The extension may only be populated when gender is other',
          expression: "%resource.where(gender='other').exists()",
        }],
      },
    ],
  },
} as StructureDefinition;

const genderSlice: SliceDefinition = {
  sliceName: 'Geschlecht-administrativ',
  path: 'Patient.gender.extension',
  min: 0,
  max: '1',
  type: [{
    code: 'Extension',
    profile: ['http://example.org/StructureDefinition/gender-amtlich-de'],
  }],
};

const genderExtensionInstance = {
  url: 'http://example.org/StructureDefinition/gender-amtlich-de',
  valueCoding: { system: 'http://fhir.de/CodeSystem/gender-amtlich-de', code: 'D' },
};

function validateWithPatient(gender: string) {
  return validateSliceTypeProfileConstraints(
    genderExtensionInstance,
    genderSlice,
    'Patient.gender.extension[0]',
    'R4',
    async () => genderExtensionProfile,
    new ConstraintValidator(),
    { resourceType: 'Patient', id: 'example', gender },
  );
}

describe('validateSliceTypeProfileConstraints %resource binding', () => {
  it('binds %resource to the containing resource, not the slice value', async () => {
    const issues = await validateWithPatient('other');

    expect(issues.find(issue => issue.ruleId === 'gender-amtlich-1')).toBeUndefined();
  });

  it('still reports the violation when the containing resource fails the invariant', async () => {
    const issues = await validateWithPatient('male');

    const violation = issues.find(issue => issue.ruleId === 'gender-amtlich-1');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.path).toBe('Patient.gender.extension[0].valueCoding');
  });
});
