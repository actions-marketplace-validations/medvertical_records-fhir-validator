import { afterEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: logs }));

import { handleConstraintEvaluationFailure } from './constraint-evaluation-failure';

const constraint = {
  key: 'demo-1',
  severity: 'error' as const,
  human: 'Demo constraint',
  expression: 'name.exists()',
};

describe('constraint evaluation failure policy', () => {
  afterEach(() => vi.clearAllMocks());

  it('records and skips explicit engine capability limitations', () => {
    const record = vi.fn();

    const issues = handleConstraintEvaluationFailure({
      constraint,
      diagnosticTracker: { record },
      elementPath: 'Patient.name',
      error: new Error('asynchronous function memberOf is not allowed'),
      profileUrl: 'https://example.test/StructureDefinition/Patient',
      resourceType: 'Patient',
    });

    expect(issues).toEqual([]);
    expect(record).toHaveBeenCalledWith(
      'async-function',
      constraint,
      'https://example.test/StructureDefinition/Patient',
      'Patient.name',
      'asynchronous function memberOf is not allowed',
    );
    expect(logs.debug).toHaveBeenCalledWith(
      '[ConstraintValidator] Skipping unsupported FHIRPath function',
      expect.objectContaining({ skipReason: 'async-function' }),
    );
    expect(logs.warn).not.toHaveBeenCalled();
  });

  it('maps other failures to unchecked diagnostics with warning telemetry', () => {
    const record = vi.fn();

    const issues = handleConstraintEvaluationFailure({
      constraint,
      diagnosticTracker: { record },
      elementPath: 'Patient.name',
      error: new Error('evaluation failed'),
      profileUrl: 'https://example.test/StructureDefinition/Patient',
      resourceType: 'Patient',
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-constraint-evaluation-error',
        severity: 'information',
        ruleId: 'demo-1',
      }),
    ]);
    expect(record).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalledWith(
      '[ConstraintValidator] Constraint evaluation failed',
      expect.any(Object),
    );
  });
});
