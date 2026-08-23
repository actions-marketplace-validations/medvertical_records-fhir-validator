import { describe, expect, it } from 'vitest';
import { CanonicalResourceInvariantValidator } from '../canonical-resource-invariant-validator';

describe('CanonicalResourceInvariantValidator', () => {
  const validator = new CanonicalResourceInvariantValidator();

  it('reports invalid canonical resource names', () => {
    expect(validator.validate({
      resourceType: 'ValueSet',
      name: 'invalid-name',
    })).toContainEqual(expect.objectContaining({
      code: 'canonical-resource-invariant-vsd-0',
      severity: 'warning',
    }));
  });

  it('enforces at least two components on composite SearchParameters', () => {
    expect(validator.validate({
      resourceType: 'SearchParameter',
      type: 'composite',
      component: [{}],
    })).toContainEqual(expect.objectContaining({
      code: 'business-rule-sp-composite',
      severity: 'error',
    }));
  });

  it('ignores malformed non-resource values safely', () => {
    expect(validator.validate(null)).toEqual([]);
    expect(validator.validate({ resourceType: 42, name: {} })).toEqual([]);
  });
});
