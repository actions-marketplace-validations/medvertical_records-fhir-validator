import { describe, expect, it } from 'vitest';
import { constraintPassed } from '../sd-fhirpath-result-utils';

describe('constraintPassed', () => {
  it('only accepts a non-empty Boolean true result', () => {
    expect(constraintPassed(true)).toBe(true);
    expect(constraintPassed([true])).toBe(true);
    expect(constraintPassed([true, true])).toBe(true);
  });

  it('rejects false, empty, missing, and non-Boolean results', () => {
    expect(constraintPassed(false)).toBe(false);
    expect(constraintPassed([true, false])).toBe(false);
    expect(constraintPassed([])).toBe(false);
    expect(constraintPassed(undefined)).toBe(false);
    expect(constraintPassed(null)).toBe(false);
    expect(constraintPassed(['true'])).toBe(false);
    expect(constraintPassed({ value: true })).toBe(false);
  });
});
