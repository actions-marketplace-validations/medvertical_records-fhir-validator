import { describe, expect, it } from 'vitest';

import { BestPracticeValidator } from '../best-practice-validator';

describe('BestPracticeValidator safety', () => {
  it('returns no issues for malformed roots', () => {
    const validator = new BestPracticeValidator();

    expect(validator.validate({
      resource: null,
      resourceType: 'Observation',
    })).toEqual([]);
    expect(validator.validate({
      resource: [],
      resourceType: 'Patient',
    })).toEqual([]);
  });

  it('creates stable issue identities with canonical informational severity', () => {
    const validator = new BestPracticeValidator();
    const context = {
      resource: { resourceType: 'Observation' },
      resourceType: 'Observation',
      profileUrl: 'https://example.test/StructureDefinition/Observation',
    };

    const first = validator.validate(context);
    const second = validator.validate(context);

    expect(first.map(issue => issue.id)).toEqual(second.map(issue => issue.id));
    expect(first.every(issue => issue.severity === 'information')).toBe(true);
    expect(first.every(issue => issue.profile === context.profileUrl)).toBe(true);
    expect(first.every(issue => issue.tags?.includes('best-practice'))).toBe(true);
  });

  it('uses the actual resource type instead of stale caller metadata', () => {
    const issues = new BestPracticeValidator().validate({
      resource: {
        resourceType: 'Patient',
        identifier: [{ value: '1' }],
        name: [{ family: 'Example' }],
        text: { div: '<div>Patient</div>' },
      },
      resourceType: 'Observation',
    });

    expect(issues).toEqual([]);
  });

  it('handles malformed Condition codings and still emits display advice', () => {
    const issues = new BestPracticeValidator().validate({
      resource: {
        resourceType: 'Condition',
        code: {
          coding: [null, 42, { display: '' }],
        },
        clinicalStatus: { coding: [{ code: 'active' }] },
      },
      resourceType: 'Condition',
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'best-practice-condition-code-display',
        path: 'Condition.code',
      }),
    ]);
  });

  it('finds entered-in-error in any verificationStatus coding', () => {
    const issues = new BestPracticeValidator().validate({
      resource: {
        resourceType: 'Condition',
        verificationStatus: {
          coding: [
            { code: 'provisional' },
            null,
            { code: 'entered-in-error' },
          ],
        },
      },
      resourceType: 'Condition',
    });

    expect(issues.some(
      issue => issue.code === 'best-practice-condition-clinical-status',
    )).toBe(false);
  });

  it('uses precise effective and period paths', () => {
    const validator = new BestPracticeValidator();
    const diagnosticIssues = validator.validate({
      resource: { resourceType: 'DiagnosticReport' },
      resourceType: 'DiagnosticReport',
    });
    const encounterIssues = validator.validate({
      resource: { resourceType: 'Encounter', period: {} },
      resourceType: 'Encounter',
    });

    expect(diagnosticIssues).toContainEqual(expect.objectContaining({
      code: 'best-practice-diagreport-effective',
      path: 'DiagnosticReport.effective[x]',
    }));
    expect(encounterIssues).toContainEqual(expect.objectContaining({
      code: 'best-practice-encounter-period',
      path: 'Encounter.period.start',
    }));
  });
});
