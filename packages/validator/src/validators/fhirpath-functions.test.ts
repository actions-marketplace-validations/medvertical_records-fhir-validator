import { describe, expect, it } from 'vitest';
import {
  conformsToFunction,
  createFHIRPathContext,
  extensionFunction,
  resolveFunction,
} from './fhirpath-functions';

describe('FHIRPath helper functions', () => {
  it('does not resolve references by substring', () => {
    const patient12 = { resourceType: 'Patient', id: '12' };
    const context = createFHIRPathContext(
      { resourceType: 'Observation' },
      new Map([['Patient/12', patient12]]),
    );

    expect(resolveFunction([{ reference: 'Patient/1' }], context)).toEqual([]);
    expect(resolveFunction([{ reference: 'Patient/12' }], context)).toEqual([patient12]);
  });

  it('normalizes absolute and versioned references to ResourceType/id', () => {
    const patient = { resourceType: 'Patient', id: 'one' };
    const context = createFHIRPathContext(
      { resourceType: 'Observation' },
      [patient],
    );

    expect(resolveFunction([{
      reference: 'https://server.example/fhir/Patient/one/_history/3',
    }], context)).toEqual([patient]);
  });

  it('keeps contained lookup limited to local hash references', () => {
    const contained = { resourceType: 'Patient', id: 'one' };
    const context = createFHIRPathContext({
      resourceType: 'Observation',
      contained: [contained],
    });

    expect(resolveFunction([{ reference: '#one' }], context)).toEqual([contained]);
    expect(resolveFunction([{ reference: 'one' }], context)).toEqual([]);
  });

  it('ignores malformed extensions and profile entries', () => {
    // The concrete value[x] is mirrored onto `value` so `.value` navigation
    // works on the raw (TypeInfo-less) objects fhirpath.js receives.
    expect(extensionFunction([
      null,
      { extension: [null, { url: 'http://example.com/ext', valueString: 'yes' }] },
    ], 'http://example.com/ext')).toEqual([
      { url: 'http://example.com/ext', valueString: 'yes', value: 'yes' },
    ]);

    expect(conformsToFunction([{
      resourceType: 'Patient',
      meta: { profile: [42, 'http://example.com/Patient'] },
    }], 'http://example.com/Patient')).toEqual([true]);
  });

  it('propagates empty conformsTo input instead of asserting conformance', () => {
    expect(conformsToFunction([], 'http://example.com/Patient')).toEqual([]);
  });

  it('reads references through fhirpath.js ResourceNode wrappers', () => {
    const patient = { resourceType: 'Patient', id: 'p1' };
    const context = createFHIRPathContext({ resourceType: 'Observation' }, [patient]);
    const referenceNode = {
      data: { reference: 'Patient/p1' },
      fhirNodeDataType: 'Reference',
    };

    expect(resolveFunction([referenceNode], context)).toEqual([patient]);
  });
});
