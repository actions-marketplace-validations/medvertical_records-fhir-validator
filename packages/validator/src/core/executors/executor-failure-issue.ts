import type { ValidationIssue } from '../../types';
import { createSafeValidationFailureMessage } from '../../utils/validation-execution-failure';
import { createValidationErrorIssue } from '../core-validation-issue';

export function createExecutorFailureIssue(
  aspect: ValidationIssue['aspect'],
  label: string,
  path?: string,
  details?: Record<string, unknown>,
): ValidationIssue {
  return createValidationErrorIssue(
    aspect,
    'validation-error',
    createSafeValidationFailureMessage(`${label} validation`),
    details,
    path,
  );
}
