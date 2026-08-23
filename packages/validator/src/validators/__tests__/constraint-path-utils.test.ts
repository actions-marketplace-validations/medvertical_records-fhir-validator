import { describe, expect, it } from 'vitest';
import {
  elementExistsInResource,
  getEvaluationContext,
  hasEmptyBackboneElement,
} from '../constraint-path-utils';

describe('constraint path utilities', () => {
  const patient = {
    resourceType: 'Patient',
    identifier: [
      { value: 'plain' },
      {
        _value: {
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
            valueCode: 'masked',
          }],
        },
      },
    ],
  };

  it('resolves the resource root path to the resource', () => {
    expect(elementExistsInResource(patient, 'Patient')).toBe(true);
    expect(getEvaluationContext(patient, 'Patient')).toBe(patient);
  });

  it('treats primitive sidecar-only values as existing elements', () => {
    expect(elementExistsInResource(patient, 'Patient.identifier[1].value')).toBe(true);
  });

  it('returns the primitive sidecar as the evaluation context instead of the root resource', () => {
    expect(getEvaluationContext(patient, 'Patient.identifier[1].value')).toEqual({
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
        valueCode: 'masked',
      }],
    });
  });

  it('does not fall back to the root resource for truly missing primitive paths', () => {
    expect(getEvaluationContext(patient, 'Patient.identifier[0].assigner')).toBeUndefined();
  });

  it('collects every context below an unindexed repeated parent', () => {
    expect(getEvaluationContext(patient, 'Patient.identifier.value')).toEqual([
      'plain',
      {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'masked',
        }],
      },
    ]);
  });

  it('resolves concrete choice values through a choice path', () => {
    const observation = {
      resourceType: 'Observation',
      valueQuantity: {
        value: 4,
        unit: 'mg',
      },
    };

    expect(getEvaluationContext(observation, 'Observation.value[x]')).toEqual({
      value: 4,
      unit: 'mg',
    });
    expect(elementExistsInResource(observation, 'Observation.value[x]')).toBe(true);
  });

  it('detects empty backbone instances without treating an empty collection as an instance', () => {
    expect(hasEmptyBackboneElement(
      { resourceType: 'Patient', contact: [{}] },
      'Patient.contact',
    )).toBe(true);
    expect(hasEmptyBackboneElement(
      { resourceType: 'Patient', contact: [{ name: {} }] },
      'Patient.contact',
    )).toBe(true);
    expect(hasEmptyBackboneElement(
      { resourceType: 'Patient', contact: [] },
      'Patient.contact',
    )).toBe(false);
    expect(hasEmptyBackboneElement(
      { resourceType: 'Patient', contact: [{ name: { family: 'Curie' } }] },
      'Patient.contact',
    )).toBe(false);
  });

  it('returns absence for malformed resources and paths without throwing', () => {
    expect(getEvaluationContext(null, 'Patient.name')).toBeUndefined();
    expect(getEvaluationContext(42, 'Patient.name')).toBeUndefined();
    expect(elementExistsInResource({ resourceType: 'Patient' }, '')).toBe(false);
    expect(hasEmptyBackboneElement({ resourceType: 'Patient' }, '')).toBe(false);
  });
});
