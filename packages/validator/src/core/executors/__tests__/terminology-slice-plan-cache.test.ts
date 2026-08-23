import { describe, expect, it } from 'vitest';
import type { ElementDefinition, StructureDefinition } from '../../structure-definition-types';
import { TerminologySlicePlanCache } from '../terminology-slice-plan-cache';

describe('TerminologySlicePlanCache', () => {
  it('invalidates cached plans when snapshot elements are added in place', () => {
    const slice: ElementDefinition = {
      id: 'Observation.category:first',
      path: 'Observation.category',
      sliceName: 'first',
    };
    const elements = [slice];
    const structureDef = {
      resourceType: 'StructureDefinition',
      snapshot: { element: elements },
    } as StructureDefinition;
    const cache = new TerminologySlicePlanCache();

    expect(cache.getSiblingSlicePatterns(structureDef, slice)).toEqual([]);
    elements.push({
      id: 'Observation.category:second',
      path: 'Observation.category',
      sliceName: 'second',
      patternCodeableConcept: { text: 'second' },
    } as ElementDefinition);

    expect(cache.getSiblingSlicePatterns(structureDef, slice)).toHaveLength(1);
  });
});
