import type { ValidationIssue } from '../types';
import { logger } from '../logger';
import { createValidationErrorIssue } from './validation-utils';
import { withIssuesSchemaVersion } from './issue-schema-version';
import {
  createSafeValidationFailureMessage,
  validationFailureMetadata,
} from '../utils/validation-execution-failure';
import {
  executeRecordsResourceValidation,
  type RecordsSingleResourceValidationContext,
  type RecordsSingleResourceValidationInput,
} from './validator-single-resource-pipeline';

export async function validateRecordsResource(
  input: RecordsSingleResourceValidationInput,
  context: RecordsSingleResourceValidationContext,
): Promise<ValidationIssue[]> {
  const {
    resource,
    profileUrl,
    fhirVersion,
    settings,
    fhirClient,
    referenceResolver,
    organizationId,
    serverId,
  } = input;
  const startTime = Date.now();
  const executionInput: RecordsSingleResourceValidationInput = {
    resource,
    profileUrl,
    fhirVersion,
    settings,
    fhirClient,
    referenceResolver,
    organizationId,
    serverId,
  };

  try {
    const issues = await executeRecordsResourceValidation(executionInput, context, startTime);
    return withIssuesSchemaVersion(issues, fhirVersion);
  } catch (error) {
    logger.error(
      '[RecordsValidator] Validation failed',
      validationFailureMetadata(error),
    );
    return withIssuesSchemaVersion([createValidationErrorIssue(
      'profile',
      'validation-error',
      createSafeValidationFailureMessage('Validation'),
    )], fhirVersion);
  }
}
