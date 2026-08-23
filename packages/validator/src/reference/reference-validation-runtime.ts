import type { ValidationSettings } from '@records-fhir/validation-types';
import { logger } from '../logger';
import type { ValidationIssue } from '../types';
import type { ExtractedReference } from './reference-extracted-validation';
import {
  buildRecursiveReferenceIssues,
  buildReferencePathsByValue,
} from './reference-recursive-issues';
import { parseReference } from './reference-type-extractor';
import { getRecursiveValidationConfig } from './reference-validation-args';
import type { ReferenceValidatorDependencies } from './reference-validator-dependencies';
import { createReferenceValidationIssue } from './reference-utils';

export type ReferenceResourceFetcher = (reference: string) => Promise<unknown>;

/** Owns optional recursive resolution and its operational failure mapping. */
export class ReferenceValidationRuntime {
  constructor(
    private readonly recursiveValidator: ReferenceValidatorDependencies['recursiveValidator'],
  ) {}

  async validateRecursiveReferences(
    resource: unknown,
    resourceType: string,
    settings: ValidationSettings | undefined,
    extractedReferences: ExtractedReference[],
    fhirClientOrVersion?: unknown,
  ): Promise<ValidationIssue[]> {
    const config = getRecursiveValidationConfig(settings);
    if (!config.enabled) return [];
    logger.debug(`[ReferenceValidator] Recursive validation enabled (maxDepth: ${config.maxDepth})`);

    try {
      const result = await this.recursiveValidator.validateRecursively(
        resource,
        config,
        createResourceFetcher(fhirClientOrVersion),
      );
      const issueResult = config.validateExternal
        ? result
        : { ...result, unresolvedReferences: [] };
      const issues = buildRecursiveReferenceIssues(
        issueResult,
        config.timeoutMs,
        resourceType,
        buildReferencePathsByValue(extractedReferences),
      );
      logger.debug(
        `[ReferenceValidator] Recursive validation: ${result.totalResourcesValidated} resources, `
        + `depth ${result.maxDepthReached}, ${result.referencesFollowed} refs followed`
        + (result.timedOut ? ' (TIMED OUT)' : ''),
      );
      return issues;
    } catch (error: unknown) {
      logger.error(
        '[ReferenceValidator] Recursive reference validation failed',
        referenceFailureMetadata(error),
      );
      return [createReferenceFailureIssue(resourceType, 'recursive')];
    }
  }
}

export function createReferenceFailureIssue(
  resourceType: string,
  stage: 'reference' | 'recursive',
): ValidationIssue {
  return createReferenceValidationIssue({
    code: 'reference-validation-error',
    severity: 'error',
    message: 'Reference validation could not be completed',
    humanReadable: 'Reference validation could not be completed',
    details: { resourceType, stage },
    resourceType,
  });
}

export function referenceFailureMetadata(error: unknown): {
  errorType: 'error' | 'non-error';
  errorCode?: string;
} {
  const rawCode = error && typeof error === 'object'
    ? (error as { code?: unknown }).code
    : undefined;
  const errorCode = typeof rawCode === 'string' && /^[A-Z0-9_-]{1,64}$/.test(rawCode)
    ? rawCode
    : undefined;
  return {
    errorType: error instanceof Error ? 'error' : 'non-error',
    ...(errorCode ? { errorCode } : {}),
  };
}

function createResourceFetcher(value: unknown): ReferenceResourceFetcher | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const getResource = (value as { getResource?: unknown }).getResource;
  if (typeof getResource !== 'function') return undefined;
  return async reference => {
    const parsed = parseReference(reference);
    if (!parsed.isValid || !parsed.resourceType || !parsed.resourceId) return null;
    return getResource.call(value, parsed.resourceType, parsed.resourceId);
  };
}
