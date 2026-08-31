import { describe, expect, it } from 'vitest';

import { isResolvedPrimitiveSidecarValue } from '../../core/fhir-primitive-sidecar';
import { ElementContextResolver } from '../element-context-resolver';

describe('ElementContextResolver', () => {
  const elementContextResolver = new ElementContextResolver();

  it('does not mistake valueSet for a concrete value[x] property', () => {
    const resource = {
      resourceType: 'Observation',
      valueSet: 'http://example.org/ValueSet/not-a-choice',
      valueString: 'actual choice',
    };

    expect(elementContextResolver.getValuesAtPath(
      resource,
      'Observation.value[x]',
      'Observation',
    )).toEqual(['actual choice']);
  });

  it('does not match lowercase suffixes as choice types', () => {
    const resource = {
      resourceType: 'Observation',
      valuefoo: 'not a FHIR choice',
    };

    expect(elementContextResolver.elementExists(
      resource,
      'Observation.value[x]',
      'Observation',
    )).toBe(false);
  });

  it('resolves meaningful primitive choice sidecars consistently', () => {
    const resource = {
      resourceType: 'Observation',
      _valueString: {
        extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason' }],
      },
    };

    const contexts = elementContextResolver.resolveContexts(
      resource,
      'Observation.value[x]',
      'Observation',
    );

    expect(contexts).toHaveLength(1);
    expect(contexts[0].fullPath).toBe('Observation.valueString');
    expect(isResolvedPrimitiveSidecarValue(contexts[0].value)).toBe(true);
  });

  it('returns no context for malformed scalar parents', () => {
    expect(elementContextResolver.resolveContexts(
      42,
      'Observation.value[x]',
      'Observation',
    )).toEqual([]);
  });
});
