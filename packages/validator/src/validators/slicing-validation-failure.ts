import { createValidationIssue } from '../issues';
import { logger } from '../logger';
import type { ValidationIssue } from '../types';
import {
  createSafeValidationFailureMessage,
  validationFailureMetadata,
} from '../utils/validation-execution-failure';
import { resourceTypeFromPath } from './slicing-content-rules';

/** Log bounded diagnostics and create the safe public Slicing failure issue. */
export function handleSlicingValidationFailure(
  error: unknown,
  elementPath: string,
): ValidationIssue {
  logger.error(
    '[SlicingValidator] Slicing validation failed',
    validationFailureMetadata(error),
  );
  return createValidationIssue({
    code: 'profile-slice-validation-error',
    path: elementPath,
    resourceType: resourceTypeFromPath(elementPath),
    customMessage: createSafeValidationFailureMessage('Slicing validation'),
  });
}
