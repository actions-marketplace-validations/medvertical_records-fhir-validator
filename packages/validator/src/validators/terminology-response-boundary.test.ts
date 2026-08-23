import { describe, expect, it } from 'vitest';
import {
  extractSubsumptionOutcome,
  operationOutcomeCannotResolveBinding,
  validateCodeSucceeded,
} from './terminology-parameters';
import {
  extractTerminologyIssues,
  mapOperationOutcomeIssues,
} from './terminology-api-outcome';
import {
  operationOutcomeToCodeSystemResult,
  parseCodeSystemValidationParameters,
} from './terminology-code-system-result';

describe('terminology response boundaries', () => {
  it('does not accept malformed Parameters as successful validation', () => {
    expect(validateCodeSucceeded(null)).toBe(false);
    expect(validateCodeSucceeded({ resourceType: 'Parameters', parameter: [null] })).toBe(false);

    expect(parseCodeSystemValidationParameters(
      { resourceType: 'Patient', parameter: [] },
      'code',
      'http://example.com/system',
    )).toMatchObject({
      valid: false,
      reason: 'system-unresolvable',
    });
  });

  it('accepts only declared FHIR subsumption outcomes', () => {
    const response = (valueCode: unknown) => ({
      resourceType: 'Parameters',
      parameter: [{ name: 'outcome', valueCode }],
    });

    expect(extractSubsumptionOutcome(response('subsumes'))).toBe('subsumes');
    expect(extractSubsumptionOutcome(response('invented-outcome'))).toBeUndefined();
    expect(extractSubsumptionOutcome(response(42))).toBeUndefined();
  });

  it('reads cannot-resolve evidence only from structured string fields', () => {
    expect(operationOutcomeCannotResolveBinding({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'Unable to resolve the requested ValueSet' } }],
    })).toBe(true);
    expect(operationOutcomeCannotResolveBinding({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: { message: 'Unable to resolve' } } }],
    })).toBe(false);
  });

  it('normalizes malformed issue fields without leaking non-strings', () => {
    const outcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'fatal',
        code: 42,
        diagnostics: { text: 'not a string' },
        expression: ['Patient.code', 7],
      }],
    };

    expect(mapOperationOutcomeIssues(outcome)).toEqual([{
      severity: 'error',
      code: 'terminology-issue',
      message: 'Terminology server reported a code issue',
      expression: ['Patient.code'],
    }]);
    expect(operationOutcomeToCodeSystemResult(
      outcome,
      'code',
      'http://example.com/system',
    ).message).toBe('Terminology server reported a code issue');
  });

  it('extracts nested OperationOutcome issues only from Parameters entries', () => {
    expect(extractTerminologyIssues({
      resourceType: 'Parameters',
      parameter: [{
        name: 'issues',
        resource: {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'warning', diagnostics: 'Check display' }],
        },
      }],
    })).toEqual([expect.objectContaining({
      severity: 'warning',
      message: 'Check display',
    })]);
  });
});
