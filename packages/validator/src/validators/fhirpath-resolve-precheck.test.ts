import { describe, expect, it } from 'vitest';
import { evaluateResolveExistsConstraint } from './fhirpath-resolve-precheck';

describe('FHIRPath resolve exists precheck', () => {
  it('resolves contained references and applies type filters', () => {
    const rootResource = {
      resourceType: 'Patient',
      contained: [{ resourceType: 'Observation', id: 'obs-1' }],
    };

    expect(evaluateResolveExistsConstraint({
      expression: 'resolve().ofType(Observation).exists()',
      context: { reference: '#obs-1' },
      rootResource,
    })).toBe(true);
    expect(evaluateResolveExistsConstraint({
      expression: 'resolve().ofType(Condition).exists()',
      context: { reference: '#obs-1' },
      rootResource,
    })).toBe(false);
  });

  it('keeps unresolved external references indeterminate without a closed bundle', () => {
    expect(evaluateResolveExistsConstraint({
      expression: 'resolve().exists()',
      context: { reference: 'Patient/external' },
      rootResource: { resourceType: 'Observation' },
    })).toBeNull();
  });

  it('treats a missing contained reference as deterministically unresolved', () => {
    expect(evaluateResolveExistsConstraint({
      expression: 'resolve().exists()',
      context: { reference: '#missing' },
      rootResource: { resourceType: 'Observation', contained: [] },
    })).toBe(false);
  });

  it('terminates when the reference path contains a cyclic array', () => {
    const subject: unknown[] = [];
    subject.push(subject);

    expect(evaluateResolveExistsConstraint({
      expression: 'subject.resolve().exists()',
      context: { subject },
      rootResource: { resourceType: 'Observation' },
    })).toBe(false);
  });

  it('does not treat a longer bundled id as a substring match', () => {
    expect(evaluateResolveExistsConstraint({
      expression: 'resolve().exists()',
      context: { reference: 'Patient/1' },
      rootResource: { resourceType: 'Observation' },
      bundle: new Map([
        ['Patient/12', { resourceType: 'Patient', id: '12' }],
      ]),
    })).toBe(false);
  });

  it('returns null for unsupported expression shapes', () => {
    expect(evaluateResolveExistsConstraint({
      expression: 'subject.exists()',
      context: {},
      rootResource: { resourceType: 'Observation' },
    })).toBeNull();
  });
});
