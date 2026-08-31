import { describe, expect, it } from 'vitest';

import { resolveConstraintContext } from '../constraint-context-resolver';

describe('constraint context resolver', () => {
  it('rewrites a repeated backbone choice expression from the resource root', () => {
    const observation = {
      resourceType: 'Observation',
      component: [
        { valueString: 'text' },
        { valueQuantity: { value: 4, unit: 'mg' } },
      ],
    };

    expect(resolveConstraintContext(
      observation,
      'Observation.component[1]',
      'value.exists()',
    )).toEqual({
      context: observation,
      expression: 'component[1].all(value.exists())',
    });
  });

  it('rewrites from the root when the choice value exists only as an underscore sidecar', () => {
    const inv1 = '(part.exists() and value.empty() and resource.empty()) or (part.empty() and (value.exists() xor resource.exists()))';
    const parameters = {
      resourceType: 'Parameters',
      parameter: [{
        name: 'Is pregnancy confirmed',
        _valueBoolean: {
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
            valueCode: 'unknown',
          }],
        },
      }],
    };

    expect(resolveConstraintContext(
      parameters,
      'Parameters.parameter[0]',
      inv1,
    )).toEqual({
      context: parameters,
      expression: `parameter[0].all(${inv1})`,
    });
  });

  it('returns all repeated scalar contexts instead of silently using the root', () => {
    const patient = {
      resourceType: 'Patient',
      name: [
        { family: 'Curie' },
        { family: 'Meitner' },
      ],
    };

    expect(resolveConstraintContext(
      patient,
      'Patient.name.family',
      '$this.exists()',
    )).toEqual({
      context: ['Curie', 'Meitner'],
      expression: '$this.exists()',
    });
  });
});
