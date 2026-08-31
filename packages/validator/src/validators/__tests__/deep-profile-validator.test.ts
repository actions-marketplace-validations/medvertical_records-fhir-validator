import { describe, expect, it } from 'vitest';
import { deepProfileValidator } from '../deep-profile-validator';
import type { StructureDefinition } from '../../core/structure-definition-types';

describe('DeepProfileValidator', () => {
  it('matches CodeableConcept patterns against any repeated element item', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/condition-category-pattern',
      name: 'ConditionCategoryPattern',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Condition',
      snapshot: {
        element: [
          { id: 'Condition', path: 'Condition' },
          {
            id: 'Condition.category',
            path: 'Condition.category',
            patternCodeableConcept: {
              coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
              }],
            },
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Condition',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'problem-list-item',
            display: 'Problem List Item',
          }],
        }],
      },
      resourceType: 'Condition',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-pattern-mismatch')).toHaveLength(0);
  });

  it('adds remediation details for text-only CodeableConcept required binding violations', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/condition-status',
      name: 'ConditionStatus',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Condition',
      snapshot: {
        element: [
          { id: 'Condition', path: 'Condition' },
          {
            id: 'Condition.clinicalStatus',
            path: 'Condition.clinicalStatus',
            binding: {
              strength: 'required',
              valueSet: 'http://hl7.org/fhir/ValueSet/condition-clinical',
            },
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Condition',
        clinicalStatus: { text: 'active' },
      },
      resourceType: 'Condition',
      structureDef: profile,
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-required-binding-violation',
      path: 'Condition.clinicalStatus',
      details: expect.objectContaining({
        valueSet: 'http://hl7.org/fhir/ValueSet/condition-clinical',
        textValue: 'active',
        fixHint: expect.stringContaining('text-only CodeableConcept'),
      }),
    }));
  });

  it('reports actual and expected values for pattern mismatches', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/patient-profile',
      name: 'PatientProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { id: 'Patient', path: 'Patient' },
          {
            id: 'Patient.meta.profile',
            path: 'Patient.meta.profile',
            patternCanonical: 'http://example.org/StructureDefinition/expected',
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Patient',
        meta: {
          profile: ['http://example.org/StructureDefinition/actual'],
        },
      },
      resourceType: 'Patient',
      structureDef: profile,
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-pattern-mismatch',
      path: 'Patient.meta.profile[0]',
      message: expect.stringContaining('expected http://example.org/StructureDefinition/expected'),
      details: expect.objectContaining({
        expectedPattern: 'http://example.org/StructureDefinition/expected',
        actualValue: 'http://example.org/StructureDefinition/actual',
      }),
    }));
  });

  it('accepts fixed primitive values when a repeated element contains the fixed value', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/patient-profile',
      name: 'PatientProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { id: 'Patient', path: 'Patient' },
          {
            id: 'Patient.meta.profile',
            path: 'Patient.meta.profile',
            fixedCanonical: 'http://example.org/StructureDefinition/patient-profile',
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Patient',
        meta: {
          profile: ['http://example.org/StructureDefinition/patient-profile'],
        },
      },
      resourceType: 'Patient',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-fixed-value-mismatch')).toHaveLength(0);
  });

  it('does not apply an incompatible complex pattern to a primitive element', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'https://gematik.de/fhir/isik/StructureDefinition/ISiKStandort',
      name: 'ISiKStandort',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Location',
      snapshot: {
        element: [
          { id: 'Location', path: 'Location' },
          {
            id: 'Location.mode',
            path: 'Location.mode',
            type: [{ code: 'code' }],
            patternCodeableConcept: {
              coding: [{ system: 'http://hl7.org/fhir/location-mode', code: 'instance' }],
            },
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: { resourceType: 'Location', mode: 'instance' },
      resourceType: 'Location',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-pattern-mismatch')).toHaveLength(0);
  });

  it('validates every repeated parent and reports the concrete choice path', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/observation-profile',
      name: 'ObservationProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          { id: 'Observation', path: 'Observation' },
          {
            id: 'Observation.component.value[x]',
            path: 'Observation.component.value[x]',
            type: [{ code: 'integer' }],
            maxValueInteger: 5,
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Observation',
        component: [
          { valueInteger: 2 },
          { valueInteger: 10 },
        ],
      },
      resourceType: 'Observation',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-max-value-violation')).toEqual([
      expect.objectContaining({
        path: 'Observation.component[1].valueInteger',
      }),
    ]);
  });

  it('checks required bindings for every repeated CodeableConcept', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/condition-profile',
      name: 'ConditionProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Condition',
      snapshot: {
        element: [
          { id: 'Condition', path: 'Condition' },
          {
            id: 'Condition.category',
            path: 'Condition.category',
            binding: {
              strength: 'required',
              valueSet: 'http://example.org/ValueSet/category',
            },
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Condition',
        category: [
          { coding: [{ system: 'http://example.org/CodeSystem/category', code: 'valid' }] },
          { coding: [null] },
          { text: 'uncoded' },
        ],
      },
      resourceType: 'Condition',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-required-binding-violation')).toEqual([
      expect.objectContaining({ path: 'Condition.category[1]' }),
      expect.objectContaining({ path: 'Condition.category[2]' }),
    ]);
  });

  it('compares fixed objects independent of property insertion order', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/observation-method',
      name: 'ObservationMethod',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          { id: 'Observation', path: 'Observation' },
          {
            id: 'Observation.method',
            path: 'Observation.method',
            fixedCodeableConcept: {
              coding: [{ system: 'http://example.org/system', code: 'method' }],
              text: 'Method',
            },
          },
        ],
      },
    };

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Observation',
        method: {
          text: 'Method',
          coding: [{ code: 'method', system: 'http://example.org/system' }],
        },
      },
      resourceType: 'Observation',
      structureDef: profile,
    });

    expect(issues.filter(issue => issue.code === 'profile-fixed-value-mismatch')).toHaveLength(0);
  });

  it('skips malformed snapshot entries and safely formats cyclic mismatches', () => {
    const cyclicValue: Record<string, unknown> = { code: 'actual' };
    cyclicValue.self = cyclicValue;
    const profile = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/malformed-profile',
      name: 'MalformedProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          null,
          {},
          { path: 42 },
          {
            id: 'Observation.method',
            path: 'Observation.method',
            patternCodeableConcept: { code: 'expected' },
          },
        ],
      },
    } as unknown as StructureDefinition;

    expect(() => deepProfileValidator.validate({
      resource: {
        resourceType: 'Observation',
        method: cyclicValue,
      },
      resourceType: 'Observation',
      structureDef: profile,
    })).not.toThrow();

    const issues = deepProfileValidator.validate({
      resource: {
        resourceType: 'Observation',
        method: cyclicValue,
      },
      resourceType: 'Observation',
      structureDef: profile,
    });
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-pattern-mismatch',
      details: expect.objectContaining({
        actualValue: '[unserializable value]',
      }),
    }));
  });
});
