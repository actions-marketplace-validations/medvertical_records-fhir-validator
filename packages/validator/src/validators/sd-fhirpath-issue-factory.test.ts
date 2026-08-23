import { describe, expect, it } from 'vitest';
import {
  createConstraintEvaluationError,
  isUnsupportedAsyncFHIRPathError,
} from './sd-fhirpath-issue-factory';

const constraint = {
  key: 'demo-1',
  severity: 'error' as const,
  human: 'Demo constraint',
  expression: 'name.exists()',
};

describe('SDFHIRPath issue policy', () => {
  it('only classifies explicit async-function limitations as skippable', () => {
    expect(isUnsupportedAsyncFHIRPathError(
      new Error('asynchronous function memberOf is not allowed'),
    )).toBe(true);
    expect(isUnsupportedAsyncFHIRPathError(
      new Error('This operator is not allowed in the current context'),
    )).toBe(false);
  });

  it('surfaces evaluation failures as informational unchecked diagnostics', () => {
    expect(createConstraintEvaluationError(
      constraint,
      'Patient.name',
      'Patient',
      new Error('compile failed'),
      'https://example.test/StructureDefinition/Patient',
    )).toEqual(expect.objectContaining({
      code: 'profile-constraint-evaluation-error',
      severity: 'information',
      ruleId: 'demo-1',
      details: expect.objectContaining({
        constraintKey: 'demo-1',
        evaluationError: 'compile failed',
      }),
    }));
  });

  it('handles hostile throw values without losing the diagnostic', () => {
    const hostile = {
      toString() {
        throw new Error('must not escape');
      },
    };
    const first = createConstraintEvaluationError(
      constraint,
      'Patient.name',
      'Patient',
      hostile,
    );
    const second = createConstraintEvaluationError(
      constraint,
      'Patient.name',
      'Patient',
      hostile,
    );

    expect(first).toMatchObject({
      code: 'profile-constraint-evaluation-error',
      severity: 'information',
      message: expect.stringContaining('Unknown error'),
      details: expect.objectContaining({
        evaluationError: 'Unknown error',
      }),
    });
    expect(first.id).toBe(second.id);
    expect(isUnsupportedAsyncFHIRPathError(hostile)).toBe(false);
  });
});
