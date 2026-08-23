import { describe, it, expect } from 'vitest';
import { applyAdvisorRules, type AdvisorRule } from '../advisor-rules';
import type { ValidationIssue } from '@records-fhir/validation-types';

const issue = (overrides: Partial<ValidationIssue> = {}): ValidationIssue => ({
  severity: 'error',
  code: 'test-code',
  message: 'Test message',
  path: 'Patient.name',
  ...overrides,
});

describe('applyAdvisorRules', () => {
  it('suppresses issues matching by code', () => {
    const rules: AdvisorRule[] = [{
      id: 'r1',
      action: 'suppress',
      match: { code: 'test-code' },
      enabled: true,
    }];
    const result = applyAdvisorRules([issue()], rules);
    expect(result.resultIssues).toHaveLength(0);
    expect(result.evidenceIssues[0]).toMatchObject({
      rawSeverity: 'error',
      rawMessage: 'Test message',
      severity: 'error',
      disposition: 'suppressed',
      advisoryApplications: [{ ruleId: 'r1', action: 'suppress' }],
    });
    expect(result.suppressedCount).toBe(1);
    expect(result.appliedRules[0].action).toBe('suppress');
  });

  it('overrides severity with override-severity action', () => {
    const rules: AdvisorRule[] = [{
      id: 'r1',
      action: 'override-severity',
      match: { code: 'test-code' },
      transform: { severity: 'warning' },
      enabled: true,
    }];
    const result = applyAdvisorRules([issue({ severity: 'error' })], rules);
    expect(result.resultIssues).toHaveLength(1);
    expect(result.resultIssues[0].severity).toBe('warning');
    expect(result.evidenceIssues[0]).toMatchObject({
      rawSeverity: 'error',
      severity: 'warning',
      disposition: 'active',
      advisoryApplications: [{
        ruleId: 'r1',
        action: 'override-severity',
        before: 'error',
        after: 'warning',
      }],
    });
    expect(result.overriddenCount).toBe(1);
  });

  it('skips disabled rules', () => {
    const rules: AdvisorRule[] = [{
      id: 'r1',
      action: 'suppress',
      match: { code: 'test-code' },
      enabled: false,
    }];
    const result = applyAdvisorRules([issue()], rules);
    expect(result.resultIssues).toHaveLength(1);
    expect(result.suppressedCount).toBe(0);
    expect(result.appliedRules).toHaveLength(0);
  });

  it('passes issues through unchanged when no rules match', () => {
    const rules: AdvisorRule[] = [{
      id: 'r1',
      action: 'suppress',
      match: { code: 'nonexistent-code' },
      enabled: true,
    }];
    const issues = [issue({ code: 'other-code' })];
    const result = applyAdvisorRules(issues, rules);
    expect(result.resultIssues).toHaveLength(1);
    expect(result.resultIssues[0]).toEqual(issues[0]);
    expect(result.suppressedCount).toBe(0);
    expect(result.overriddenCount).toBe(0);
  });

  it('matches messages by regex when configured', () => {
    const rules: AdvisorRule[] = [{
      id: 'r1',
      action: 'override-message',
      match: { messageRegex: 'http://example\\.org/fhir/($|\\s)' },
      transform: { message: 'Canonical URL has trailing slash' },
      enabled: true,
    }];

    const result = applyAdvisorRules([
      issue({ message: 'Unknown system http://example.org/fhir/ for code 123' }),
      issue({ message: 'Code is bound to http://example.org/fhir/ValueSet/foo' }),
    ], rules);

    expect(result.resultIssues[0].message).toBe('Canonical URL has trailing slash');
    expect(result.resultIssues[1].message).toBe('Code is bound to http://example.org/fhir/ValueSet/foo');
  });

  it('applies multiple rules in order', () => {
    const rules: AdvisorRule[] = [
      {
        id: 'r1',
        action: 'override-severity',
        match: { code: 'keep-me' },
        transform: { severity: 'information' },
        enabled: true,
      },
      {
        id: 'r2',
        action: 'suppress',
        match: { code: 'remove-me' },
        enabled: true,
      },
    ];
    const issues = [
      issue({ code: 'keep-me', severity: 'error' }),
      issue({ code: 'remove-me' }),
    ];
    const result = applyAdvisorRules(issues, rules);
    expect(result.resultIssues).toHaveLength(1);
    expect(result.resultIssues[0].severity).toBe('information');
    expect(result.suppressedCount).toBe(1);
    expect(result.overriddenCount).toBe(1);
    expect(result.appliedRules).toHaveLength(2);
  });

  it('breaks equal-priority override ties by stable rule ID', () => {
    const result = applyAdvisorRules([issue()], [{
      id: 'z-last',
      action: 'override-message',
      match: { code: 'test-code' },
      transform: { message: 'Selected by input order' },
      priority: 100,
      enabled: true,
    }, {
      id: 'a-first',
      action: 'override-message',
      match: { code: 'test-code' },
      transform: { message: 'Selected by stable ID' },
      priority: 100,
      enabled: true,
    }]);

    expect(result.resultIssues[0].message).toBe('Selected by stable ID');
    expect(result.appliedRules).toEqual([{
      ruleId: 'a-first',
      issueCode: 'test-code',
      action: 'message-override',
    }]);
  });
});
