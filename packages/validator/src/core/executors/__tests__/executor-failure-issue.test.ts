import { describe, expect, it } from 'vitest';
import { createExecutorFailureIssue } from '../executor-failure-issue';

describe('createExecutorFailureIssue', () => {
  it('creates deterministic executor failures', () => {
    const first = createExecutorFailureIssue(
      'profile',
      'Profile',
    );
    const second = createExecutorFailureIssue(
      'profile',
      'Profile',
    );

    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      aspect: 'profile',
      severity: 'error',
      code: 'validation-error',
      message:
        'Profile validation could not be completed because the validator encountered an operational error.',
      path: '',
    });
  });

  it('uses only its controlled operation label in the public message', () => {
    expect(createExecutorFailureIssue('reference', 'Reference'))
      .toMatchObject({
        message:
          'Reference validation could not be completed because the validator encountered an operational error.',
      });
  });

  it('includes the failing path in issue identity', () => {
    const first = createExecutorFailureIssue(
      'structural',
      'Required fields',
      'Patient.name',
    );
    const second = createExecutorFailureIssue(
      'structural',
      'Required fields',
      'Patient.birthDate',
    );

    expect(first.id).not.toBe(second.id);
  });
});
