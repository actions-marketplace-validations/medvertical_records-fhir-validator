import { describe, expect, it } from 'vitest';
import type { ElementDefinition, StructureDefinition } from '../../structure-definition-types';
import { TerminologyElementPlanCache } from '../terminology-element-plan-cache';

function structureDefinition(elements: unknown[]): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: 'https://example.test/StructureDefinition/Observation',
    name: 'Observation',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Observation',
    snapshot: { element: elements as ElementDefinition[] },
  };
}

describe('TerminologyElementPlanCache', () => {
  it('selects bound, coded, and UCUM-bearing elements while ignoring unusable entries', () => {
    const cache = new TerminologyElementPlanCache();
    const structureDef = structureDefinition([
      { path: 'Observation.status', binding: { strength: 'required' } },
      { path: 'Observation.code', type: [{ code: 'CodeableConcept' }] },
      { path: 'Observation.method', type: [{ code: 'Coding' }] },
      { path: 'Observation.valueQuantity', type: [{ code: 'Quantity' }] },
      { path: 'Observation.note', type: [{ code: 'Annotation' }] },
      { type: [{ code: 'Coding' }] },
      null,
    ]);

    expect(cache.get(structureDef).map(element => element.path)).toEqual([
      'Observation.status',
      'Observation.code',
      'Observation.method',
      'Observation.valueQuantity',
    ]);
  });

  it('plans coded children expanded from content references and reuses the plan', () => {
    const cache = new TerminologyElementPlanCache();
    const structureDef = structureDefinition([
      { id: 'Observation.component', path: 'Observation.component' },
      {
        id: 'Observation.component.code',
        path: 'Observation.component.code',
        type: [{ code: 'CodeableConcept' }],
      },
      {
        id: 'Observation.related',
        path: 'Observation.related',
        contentReference: '#Observation.component',
      },
    ]);

    const first = cache.get(structureDef);

    expect(first.map(element => element.path)).toEqual([
      'Observation.component.code',
      'Observation.related.code',
    ]);
    expect(cache.get(structureDef)).toBe(first);
  });
});
