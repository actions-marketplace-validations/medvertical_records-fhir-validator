import { describe, expect, it } from 'vitest';
import { validateDom3Constraint } from '../constraint-dom-rules';

const DOM_3 = {
  key: 'dom-3',
  severity: 'error' as const,
  human: 'Contained resources must be referenced',
};

describe('validateDom3Constraint', () => {
  it('reports an unreferenced contained resource', () => {
    expect(validateDom3Constraint({
      resourceType: 'Patient',
      contained: [{ resourceType: 'Organization', id: 'organization' }],
    }, 'Patient', DOM_3, 'Patient')).toContainEqual(expect.objectContaining({
      ruleId: 'dom-3',
      details: expect.objectContaining({ containedId: 'organization' }),
    }));
  });

  it('accepts a contained resource that references its container', () => {
    expect(validateDom3Constraint({
      resourceType: 'Patient',
      contained: [{
        resourceType: 'Organization',
        id: 'organization',
        partOf: { reference: '#' },
      }],
    }, 'Patient', DOM_3, 'Patient')).toEqual([]);
  });

  it('terminates safely for cyclic object graphs', () => {
    const contained: Record<string, unknown> = {
      resourceType: 'Organization',
      id: 'organization',
    };
    contained.self = contained;

    expect(() => validateDom3Constraint({
      resourceType: 'Patient',
      contained: [contained],
    }, 'Patient', DOM_3, 'Patient')).not.toThrow();
  });
});
