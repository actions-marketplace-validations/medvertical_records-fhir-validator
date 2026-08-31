import { describe, expect, it } from 'vitest';
import {
  aggregateFunction,
  conformsToFunction,
  descendantsFunction,
  createMemberOfFunction,
  resolveFunction,
  subsetOfFunction,
  supersetOfFunction,
} from './fhirpath-custom-functions';
import { ValueSetCache } from './valueset-cache';

const memberOfFunction = createMemberOfFunction(new ValueSetCache());

describe('FHIRPath custom function boundaries', () => {
  it('resolves exact relative, absolute, and versioned bundle references only', () => {
    const patient12 = { resourceType: 'Patient', id: '12' };
    const resolver = resolveFunction({
      rootResource: { resourceType: 'Observation' },
      bundle: {
        entry: [{
          fullUrl: 'https://server.example/fhir/Patient/12',
          resource: patient12,
        }],
      },
    });

    expect(resolver.fn([{ reference: 'Patient/1' }])).toEqual([]);
    expect(resolver.fn([{
      reference: 'https://other.example/fhir/Patient/12/_history/2',
    }])).toEqual([patient12]);
  });

  it('does not throw on malformed profile or ValueSet arguments', () => {
    expect(conformsToFunction.fn([
      { resourceType: 'Patient', meta: { profile: [42] } },
    ], { url: 'not-a-string' })).toEqual([false]);
    expect(memberOfFunction.fn(['DE'], { url: 'not-a-string' })).toEqual([]);
  });

  it('propagates empty conformsTo input instead of failing the constraint', () => {
    expect(conformsToFunction.fn([], 'http://example.org/StructureDefinition/x')).toEqual([]);
  });

  it('reads memberOf codes through fhirpath.js ResourceNode wrappers', () => {
    const codeNode = { data: 'DE', fhirNodeDataType: 'code' };
    expect(memberOfFunction.fn(
      [codeNode],
      'http://hl7.org/fhir/ValueSet/iso3166-1-2',
    )).toEqual([true]);
  });

  it('resolves references handed over as ResourceNode wrappers', () => {
    const patient12 = { resourceType: 'Patient', id: '12' };
    const resolver = resolveFunction({
      rootResource: { resourceType: 'Observation' },
      bundle: {
        entry: [{
          fullUrl: 'https://server.example/fhir/Patient/12',
          resource: patient12,
        }],
      },
    });

    const referenceNode = {
      data: { reference: 'Patient/12' },
      fhirNodeDataType: 'Reference',
    };
    expect(resolver.fn([referenceNode])).toEqual([patient12]);
  });

  it('walks descendants iteratively and terminates on cycles', () => {
    const root: Record<string, unknown> = {
      name: 'Patient',
      _name: { extension: [] },
    };
    root.self = root;

    const descendants = descendantsFunction.fn([root]);

    expect(descendants).toContain('Patient');
    expect(descendants).toContain(root);
    expect(descendants).not.toContain(root._name);
  });

  it('does not concatenate numeric aggregates with a malformed initial value', () => {
    expect(aggregateFunction.fn([1, 2], ['not-a-number'])).toEqual([3]);
    expect(aggregateFunction.fn([1, 2], [10])).toEqual([13]);
  });

  it('compares cyclic collections without JSON serialization failures', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    const other: Record<string, unknown> = {};
    other.self = other;

    expect(subsetOfFunction.fn([value], [value])).toEqual([true]);
    expect(subsetOfFunction.fn([value], [other])).toEqual([false]);
    expect(supersetOfFunction.fn([value], [value])).toEqual([true]);
  });
});
