import { describe, expect, it } from 'vitest';
import { getValueAtPath } from '../../validation-utils';
import type { StructureDefinition } from '../../structure-definition-types';
import { resolveNestedSliceParentItems } from '../profile-nested-slice-scoping';

describe('nested slice scoping', () => {
  it('uses all parent discriminators when fixed values live below a child slice label', () => {
    const systolic = { code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] } };
    const diastolic = { code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] } };
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/bp-test',
      name: 'BloodPressureTest',
      type: 'Observation',
      status: 'active',
      kind: 'resource',
      abstract: false,
      snapshot: {
        element: [
          {
            id: 'Observation.component',
            path: 'Observation.component',
            slicing: {
              discriminator: [
                { type: 'value', path: 'code.coding.code' },
                { type: 'value', path: 'code.coding.system' },
              ],
              rules: 'open',
            },
          },
          {
            id: 'Observation.component:SystolicBP',
            path: 'Observation.component',
            sliceName: 'SystolicBP',
          },
          {
            id: 'Observation.component:SystolicBP.code.coding',
            path: 'Observation.component.code.coding',
            slicing: {
              discriminator: [{ type: 'value', path: 'code' }],
              rules: 'open',
            },
          },
          {
            id: 'Observation.component:SystolicBP.code.coding:SBPCode.code',
            path: 'Observation.component.code.coding.code',
            fixedCode: '8480-6',
          },
          {
            id: 'Observation.component:SystolicBP.code.coding:SBPCode.system',
            path: 'Observation.component.code.coding.system',
            fixedUri: 'http://loinc.org',
          },
        ],
      },
    };

    const scoped = resolveNestedSliceParentItems(
      { resourceType: 'Observation', component: [systolic, diastolic] },
      profile.snapshot!.element[2],
      profile,
      getValueAtPath,
    );

    expect(scoped).toEqual([systolic.code]);
  });
});
