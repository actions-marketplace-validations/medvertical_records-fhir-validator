import { afterEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: logs }));

import {
  resolveEvaluatedConstraintOutcome,
  resolveKnownConstraintOutcome,
} from './constraint-evaluation-outcome';

const context = {
  constraint: {
    key: 'demo-1',
    severity: 'error' as const,
    human: 'Demo constraint',
    expression: 'name.exists()',
  },
  elementPath: 'Patient',
  profileUrl: 'https://example.test/StructureDefinition/Patient',
  resource: { resourceType: 'Patient' },
  strictnessMode: 'standard' as const,
};

describe('constraint evaluation outcome policy', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps known specialised failures without evaluated-result telemetry', () => {
    const issues = resolveKnownConstraintOutcome(false, context);

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-constraint-violation',
        ruleId: 'demo-1',
      }),
    ]);
    expect(logs.debug).not.toHaveBeenCalled();
  });

  it('maps passing evaluated results and records root telemetry', () => {
    const issues = resolveEvaluatedConstraintOutcome([true], context);

    expect(issues).toEqual([]);
    expect(logs.debug).toHaveBeenCalledWith(
      '[ConstraintValidator] Root constraint evaluated',
      expect.objectContaining({
        passed: true,
        expressionLength: context.constraint.expression.length,
      }),
    );
  });

  it('maps failed evaluated results through the violation policy', () => {
    const issues = resolveEvaluatedConstraintOutcome([false], context);

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-constraint-violation',
        ruleId: 'demo-1',
      }),
    ]);
    expect(logs.debug).toHaveBeenCalledWith(
      '[ConstraintValidator] Root constraint evaluated',
      expect.objectContaining({ passed: false }),
    );
  });

  it('preserves unchecked diagnostics for non-Boolean results', () => {
    const issues = resolveEvaluatedConstraintOutcome(['not-a-boolean'], context);

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-constraint-evaluation-error',
        severity: 'information',
        details: expect.objectContaining({ resultTypes: ['string'] }),
      }),
    ]);
    expect(logs.debug).not.toHaveBeenCalled();
  });
});
