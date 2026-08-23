import { describe, expect, it } from 'vitest';
import { buildUserInvocationTable } from '../fhirpath-custom-functions';
import { toFHIRPathInvocationTable } from '../sd-fhirpath-runtime';
import { evaluateConstraintFHIRPath } from '../constraint-fhirpath-evaluator';

describe('constraint-engine invocation table', () => {
  // A single unknown arity parameter name used to invalidate the WHOLE table,
  // silently dropping every custom function from element-constraint FHIRPath.
  it('is accepted by the runtime table validator', () => {
    const table = buildUserInvocationTable({ resourceType: 'Patient' });
    expect(toFHIRPathInvocationTable(table)).toBe(table);
  });

  it('navigates extension(url).value on raw choice-typed extensions', async () => {
    const resource = {
      resourceType: 'Observation',
      status: 'final',
      effectivePeriod: {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'masked',
        }],
      },
    } as const;
    const table = buildUserInvocationTable(resource);

    const result = await evaluateConstraintFHIRPath(
      resource.effectivePeriod,
      "extension('http://hl7.org/fhir/StructureDefinition/data-absent-reason').value.exists()",
      resource,
      'R4',
      table,
    );
    expect(result).toEqual([true]);
  });

  it('reads primitive sidecar extensions through navigated ResourceNodes', async () => {
    // mii-pat-1 shape: extensions of a primitive live in the `_gender`
    // sidecar, which fhirpath.js carries in the node's `_data`.
    const resource = {
      resourceType: 'Patient',
      gender: 'other',
      _gender: {
        extension: [{
          url: 'http://fhir.de/StructureDefinition/gender-amtlich-de',
          valueCoding: { system: 'http://fhir.de/CodeSystem/gender-amtlich-de', code: 'D' },
        }],
      },
    };
    const table = buildUserInvocationTable(resource);

    const result = await evaluateConstraintFHIRPath(
      resource,
      "gender.extension('http://fhir.de/StructureDefinition/gender-amtlich-de').exists()",
      resource,
      'R4',
      table,
    );
    expect(result).toEqual([true]);
  });
});
