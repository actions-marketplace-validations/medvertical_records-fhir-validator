import { logger } from '../logger';
import { BundleReferenceResolver } from '../reference';
import type { ValidationIssue } from '../types';
import type { EntryResourceValidator } from './bundle-entry-resource-validation';
import { handleBundleValidationFailure } from './bundle-validation-failure';
import {
  validateBundleRules,
  type BundleValidationResolver,
} from './bundle-validation-rules';
import { toBundleRecord } from './bundle-validator-records';

export type { EntryResourceValidator } from './bundle-entry-resource-validation';

export class BundleValidator {
  constructor(
    private readonly bundleResolver: BundleValidationResolver = new BundleReferenceResolver(),
  ) {}

  async validateBundle(
    resource: unknown,
    entryValidator?: EntryResourceValidator,
  ): Promise<ValidationIssue[]> {
    const bundle = toBundleRecord(resource);
    if (bundle?.resourceType !== 'Bundle') return [];
    const issues: ValidationIssue[] = [];
    logger.debug('[BundleValidator] Validating Bundle structure and references');
    try {
      issues.push(...await validateBundleRules(bundle, this.bundleResolver, entryValidator));
      logger.debug(`[BundleValidator] Found ${issues.length} issues in Bundle`);
    } catch {
      issues.push(handleBundleValidationFailure());
    }
    return issues;
  }
}
