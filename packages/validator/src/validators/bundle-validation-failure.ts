import { createValidationIssue } from '../issues';
import { logger } from '../logger';
import type { ValidationIssue } from '../types';
import { createSafeValidationFailureMessage } from '../utils/validation-execution-failure';

export function handleBundleValidationFailure(): ValidationIssue {
  logger.error('[BundleValidator] Bundle validation failed');
  return createValidationIssue({
    code: 'bundle-validation-error',
    path: 'Bundle',
    resourceType: 'Bundle',
    customMessage: createSafeValidationFailureMessage('Bundle validation'),
    severityOverride: 'error',
  });
}
