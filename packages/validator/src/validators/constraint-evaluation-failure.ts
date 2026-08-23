import type { Constraint } from '../core/structure-definition-types';
import { logger } from '../logger';
import type { ValidationIssue } from '../types';
import { sensitiveValueMetadata } from '../utils/sensitive-logging-metadata';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import {
  classifyUnsupportedEngineCapabilityError,
  type FHIRPathConstraintDiagnosticTracker,
} from './fhirpath-constraint-diagnostics';
import {
  createConstraintEvaluationError,
  getEvaluationErrorMessage,
} from './sd-fhirpath-issue-factory';

interface ConstraintEvaluationFailureInput {
  constraint: Constraint;
  diagnosticTracker: Pick<FHIRPathConstraintDiagnosticTracker, 'record'>;
  elementPath: string;
  error: unknown;
  profileUrl: string;
  resourceType: string;
}

/** Apply the operational failure policy for general constraint evaluation. */
export function handleConstraintEvaluationFailure(
  input: ConstraintEvaluationFailureInput,
): ValidationIssue[] {
  const errorMessage = getEvaluationErrorMessage(input.error);
  const skipReason = classifyUnsupportedEngineCapabilityError(errorMessage);
  if (skipReason !== null) {
    input.diagnosticTracker.record(
      skipReason,
      input.constraint,
      input.profileUrl,
      input.elementPath,
      errorMessage,
    );
    logger.debug('[ConstraintValidator] Skipping unsupported FHIRPath function', {
      skipReason,
      ...sensitiveValueMetadata(input.constraint.key),
    });
    return [];
  }

  logger.warn('[ConstraintValidator] Constraint evaluation failed', {
    ...sensitiveValueMetadata(input.constraint.key),
    ...validationFailureMetadata(input.error),
  });
  return [
    createConstraintEvaluationError(
      input.constraint,
      input.elementPath,
      input.resourceType,
      input.error,
      input.profileUrl,
    ),
  ];
}
