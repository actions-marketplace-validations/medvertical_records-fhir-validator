import { describe, expect, it } from 'vitest';

import {
  createSDFHIRPathInvocationTable,
  toFHIRPathInvocationTable,
} from '../sd-fhirpath-runtime';

describe('FHIRPath invocation-table boundary', () => {
  it('accepts the validator-owned invocation table', () => {
    const table = createSDFHIRPathInvocationTable({
      rootResource: { resourceType: 'Patient', id: 'p1' },
    });

    expect(toFHIRPathInvocationTable(table)).toBe(table);
  });

  it.each([
    null,
    [],
    { resolve: { fn: 'not-a-function', arity: { 0: [] } } },
    { resolve: { fn: () => [], arity: { one: [] } } },
    { resolve: { fn: () => [], arity: { 1: ['Unsupported'] } } },
  ])('rejects malformed invocation table %j', value => {
    expect(toFHIRPathInvocationTable(value)).toBeUndefined();
  });
});
