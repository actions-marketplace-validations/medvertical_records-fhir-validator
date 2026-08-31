import { describe, expect, it } from 'vitest';

import { dedupeIssues } from '../validation-utils';
import { validationIssue as issue } from './validation-issue-test-builders';

function specificConstraint(entryIndex: number) {
  return issue({
    code: 'constraint-violation-pat-1',
    path: `Bundle.entry[${entryIndex}].resource/*Patient/p${entryIndex}*/.contact[0]`,
    resourceType: 'Patient',
    message: 'pat-1: contact requires identifying information',
  });
}

function genericConstraint(entryIndex: number) {
  return issue({
    code: 'profile-constraint-violation',
    path: `Bundle.entry[${entryIndex}].resource/*Patient/p${entryIndex}*/.contact[0]`,
    resourceType: 'Patient',
    message: "Constraint 'pat-1' failed",
    ruleId: 'pat-1',
    details: { constraintKey: 'pat-1' },
  });
}

describe('Bundle entry constraint dedupe', () => {
  it('suppresses a generic copy in the same Bundle entry', () => {
    const specific = specificConstraint(0);

    expect(dedupeIssues([specific, genericConstraint(0)])).toEqual([specific]);
  });

  it('keeps an independent generic finding from another Bundle entry', () => {
    const specific = specificConstraint(0);
    const independent = genericConstraint(1);

    expect(dedupeIssues([specific, independent])).toEqual([specific, independent]);
  });
});
