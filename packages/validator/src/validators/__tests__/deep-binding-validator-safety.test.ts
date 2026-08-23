import { describe, expect, it } from 'vitest';

import type {
  ElementDefinition,
  StructureDefinition,
} from '../../core/structure-definition-types';
import { DeepBindingValidator } from '../deep-binding-validator';

function profile(elements: unknown[]): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    id: 'test',
    url: 'https://example.test/StructureDefinition/Test',
    name: 'Test',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Observation',
    snapshot: { element: elements as ElementDefinition[] },
  };
}

function requiredBinding(
  path: string,
  typeCode: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: path,
    path,
    type: [{ code: typeCode }],
    binding: {
      strength: 'required',
      valueSet: 'https://example.test/ValueSet/test',
    },
    ...extra,
  };
}

describe('DeepBindingValidator safety', () => {
  it('reports repeated malformed CodeableConcept values at concrete paths', () => {
    const issues = new DeepBindingValidator().validate({
      resource: {
        resourceType: 'Observation',
        component: [
          { code: { coding: [null, 42, { code: '' }] } },
          { code: { text: 'No coding' } },
          { code: { coding: [{ code: 'valid' }] } },
        ],
      },
      resourceType: 'Observation',
      structureDef: profile([
        requiredBinding('Observation.component.code', 'CodeableConcept'),
      ]),
    });

    expect(issues.map(issue => issue.path)).toEqual([
      'Observation.component[0].code',
      'Observation.component[1].code',
    ]);
    expect(issues.every(issue => issue.code === 'deep-binding-no-valid-coding'))
      .toBe(true);
  });

  it('resolves choice binding paths through the central target resolver', () => {
    const issues = new DeepBindingValidator().validate({
      resource: {
        resourceType: 'Observation',
        valueCodeableConcept: { coding: [] },
      },
      resourceType: 'Observation',
      structureDef: profile([
        requiredBinding('Observation.value[x]', 'CodeableConcept'),
      ]),
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'deep-binding-no-valid-coding',
        path: 'Observation.valueCodeableConcept',
      }),
    ]);
  });

  it('reports present Coding and primitive code values that lack a code', () => {
    const issues = new DeepBindingValidator().validate({
      resource: {
        resourceType: 'Observation',
        interpretation: [{ system: 'https://example.test/codes' }],
        status: '',
      },
      resourceType: 'Observation',
      structureDef: profile([
        requiredBinding('Observation.interpretation', 'Coding'),
        requiredBinding('Observation.status', 'code'),
      ]),
    });

    expect(issues.map(issue => issue.path)).toEqual([
      'Observation.interpretation[0]',
      'Observation.status',
    ]);
    expect(issues.every(issue => issue.code === 'deep-binding-empty-code'))
      .toBe(true);
  });

  it('does not apply a parent binding to coded descendants', () => {
    const issues = new DeepBindingValidator().validate({
      resource: {
        resourceType: 'Observation',
        code: {
          coding: [{ code: 'valid' }],
          detail: { system: 'https://example.test/codes', code: '' },
        },
      },
      resourceType: 'Observation',
      structureDef: profile([
        requiredBinding('Observation.code', 'CodeableConcept'),
      ]),
    });

    expect(issues).toEqual([]);
  });

  it('leaves slice-scoped bindings to the slicing-aware terminology owner', () => {
    const issues = new DeepBindingValidator().validate({
      resource: {
        resourceType: 'Observation',
        category: [{ coding: [] }],
      },
      resourceType: 'Observation',
      structureDef: profile([
        requiredBinding('Observation.category', 'CodeableConcept', {
          id: 'Observation.category:laboratory',
          sliceName: 'laboratory',
        }),
      ]),
    });

    expect(issues).toEqual([]);
  });

  it('skips malformed definitions and contains cyclic resources', () => {
    const resource: Record<string, unknown> = {
      resourceType: 'Observation',
      status: 'final',
    };
    resource.loop = resource;

    const issues = new DeepBindingValidator().validate({
      resource,
      resourceType: 'Observation',
      structureDef: profile([
        null,
        42,
        { path: Symbol('Observation.status') },
        {
          path: 'Observation.status',
          binding: { strength: Symbol('required') },
        },
      ]),
    });

    expect(issues).toEqual([]);
  });
});
