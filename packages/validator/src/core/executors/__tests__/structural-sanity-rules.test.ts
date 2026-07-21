import { describe, expect, it } from 'vitest';
import {
  validatePrimitiveSidecarArrayAlignment,
  validateResourceId,
} from '../structural-sanity-rules';

describe('structural sanity rules', () => {
  it('rejects primitive sidecar entries beyond the value array', () => {
    const issues = validatePrimitiveSidecarArrayAlignment({
      resourceType: 'Patient',
      name: [{
        given: ['a'],
        _given: [{ id: 'test' }, null],
      }],
    }, 'Patient');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'structural-primitive-array-alignment',
      path: 'Patient.name[0].given',
      severity: 'error',
    }));
  });

  it('rejects extensions on Resource.id', () => {
    const issues = validateResourceId({
      resourceType: 'Patient',
      id: 'patient-1',
      _id: {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'masked',
        }],
      },
    }, 'Patient');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'structural-resource-id-extension',
      path: 'Patient.id',
      severity: 'error',
    }));
  });
});
