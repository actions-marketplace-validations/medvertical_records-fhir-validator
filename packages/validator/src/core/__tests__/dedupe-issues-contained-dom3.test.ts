import { describe, expect, it } from 'vitest';
import { dedupeIssues } from '../validation-utils';
import { validationIssue as issue } from './validation-issue-test-builders';

describe('dedupeIssues contained dom-3 suppression', () => {
  it('suppresses the profile dom-3 copy behind the specific contained-not-referenced code', () => {
    const deduped = dedupeIssues([
      issue({
        aspect: 'profile',
        code: 'profile-constraint-violation',
        severity: 'error',
        path: 'Citation',
        resourceType: 'Citation',
        message: "Constraint 'dom-3' failed: contained resource must be referenced",
        ruleId: 'dom-3',
        details: { constraintKey: 'dom-3', containedId: 'contributor0', fieldPath: 'Citation' },
      }),
      issue({
        aspect: 'structural',
        code: 'structural-contained-not-referenced',
        severity: 'error',
        path: 'Citation.contained[0]',
        resourceType: 'Citation',
        message:
          "The contained resource 'contributor0' is not referenced to from elsewhere in the containing resource nor does it refer to the containing resource",
        details: {
          constraintKey: 'dom-3',
          containedId: 'contributor0',
          fieldPath: 'Citation.contained[0]',
        },
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].code).toBe('structural-contained-not-referenced');
  });
});
