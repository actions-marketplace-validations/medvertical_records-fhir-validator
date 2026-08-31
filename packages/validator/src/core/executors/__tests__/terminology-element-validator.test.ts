import { describe, expect, it, vi } from 'vitest';

import { ValueSetCache } from '../../../validators/valueset-cache';
import { UcumCodeValidator } from '../../../validators/ucum-validator';
import type { ElementDefinition, StructureDefinition } from '../../structure-definition-types';
import { CodeSystemReferenceLookupCache } from '../terminology-code-system-reference-rules';
import { validateTerminologyElement } from '../terminology-element-validator';
import { TerminologySlicePlanCache } from '../terminology-slice-plan-cache';
import { createTerminologyValidationPortMock } from './terminology-validation-port.test-support';

const dependencyPinMocks = vi.hoisted(() => ({
  pinBinding: vi.fn(async <T>(binding: T) => binding),
}));

vi.mock('../terminology-binding-dependency-pins', () => ({
  pinBindingToDependencyPins: dependencyPinMocks.pinBinding,
}));

describe('validateTerminologyElement', () => {
  it('does not resolve binding pins for an absent optional element', async () => {
    const elementDef = {
      path: 'Observation.status',
      min: 0,
      max: '1',
      type: [{ code: 'code' }],
      binding: {
        strength: 'required',
        valueSet: 'http://hl7.org/fhir/ValueSet/observation-status',
      },
    } satisfies ElementDefinition;
    const structureDef = {
      url: 'http://example.test/StructureDefinition/optional-status',
      type: 'Observation',
      snapshot: { element: [elementDef] },
    } satisfies StructureDefinition;

    const issues = await validateTerminologyElement(
      {
        resource: { resourceType: 'Observation' },
        elementDef,
        structureDef,
        getValueAtPath: () => undefined,
        fhirVersion: 'R4',
      },
      {
        valueSetCache: new ValueSetCache(),
        valueSetValidator: createTerminologyValidationPortMock(),
        slicePlanCache: new TerminologySlicePlanCache(),
        codeSystemReferenceLookupCache: new CodeSystemReferenceLookupCache(),
        ucumValidator: new UcumCodeValidator(),
      },
    );

    expect(issues).toEqual([]);
    expect(dependencyPinMocks.pinBinding).not.toHaveBeenCalled();
  });
});
