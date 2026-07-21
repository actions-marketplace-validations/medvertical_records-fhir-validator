import type { ValidationResult, ValidationSettings } from '@records-fhir/validation-types';
import type { IReferenceValidator, ValidationContext, ValidationIssue } from '../types';
import { addR6WarningIfNeeded } from '../utils/r6-support-warnings';
import { parseReference, ReferenceTypeExtractor } from './reference-type-extractor';
import { getReferenceTypeConstraintValidator } from './reference-type-constraint-validator';
import { getContainedReferenceResolver } from './contained-reference-resolver';
import { getBundleReferenceResolver } from './bundle-reference-resolver';
import { getCircularReferenceDetector } from './circular-reference-detector';
import { getRecursiveReferenceValidator } from './recursive-reference-validator';
import { getVersionSpecificReferenceValidator } from './version-specific-reference-validator';
import { getCanonicalReferenceValidator } from './canonical-reference-validator';
import { getBatchedReferenceChecker } from './batched-reference-checker';
import { extractReferences } from './reference-format-validator';
import { validateContainedReferenceIssues } from './reference-contained-validation';
import { validateExtractedReferences } from './reference-extracted-validation';
import {
  buildRecursiveReferenceIssues,
  buildReferencePathsByValue,
} from './reference-recursive-issues';
import {
  getRecursiveValidationConfig,
  normalizeReferenceValidationArgs,
} from './reference-validation-args';
import { createReferenceValidationIssue } from './reference-utils';
import { logger } from '../logger';

export class ReferenceValidator implements IReferenceValidator {
  private referenceTypeExtractor: ReferenceTypeExtractor;
  private constraintValidator = getReferenceTypeConstraintValidator();
  private containedResolver = getContainedReferenceResolver();
  private bundleResolver = getBundleReferenceResolver();
  private circularDetector = getCircularReferenceDetector(10);
  private recursiveValidator = getRecursiveReferenceValidator();
  private versionValidator = getVersionSpecificReferenceValidator();
  private canonicalValidator = getCanonicalReferenceValidator();
  private batchedChecker = getBatchedReferenceChecker();

  constructor() {
    this.referenceTypeExtractor = new ReferenceTypeExtractor({
      allowContained: true,
      allowCanonical: true,
      extractVersion: true,
      validateResourceType: true
    });
  }

  async validate(
    resource: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const version = context.fhirVersion || 'R4';

    const issues = await this.validateInternal(
      resource,
      context.resourceType,
      version,
      context.settings
    );

    const validationTime = Date.now() - startTime;
    const isValid = issues.length === 0 || !issues.some(i => i.severity === 'error');

    return {
      resourceId: context.resourceId || resource.id || 'unknown',
      resourceType: context.resourceType,
      isValid,
      issues,
      aspects: [{
        aspect: 'reference',
        isValid,
        issues,
        validationTime,
        status: 'completed'
      }],
      validatedAt: new Date(),
      validationTime,
      fhirVersion: version
    };
  }

  async validateInternal(
    resource: any,
    resourceType: string,
    fhirClientOrVersion?: any, // Can be FhirClient or FHIR version string
    fhirVersionOrSettings?: 'R4' | 'R5' | 'R6' | ValidationSettings,
    settings?: ValidationSettings
  ): Promise<ValidationIssue[]> {
    let issues: ValidationIssue[] = [];
    const startTime = Date.now();

    if (!resource) {
      logger.warn(`[ReferenceValidator] Null resource provided`);
      return issues;
    }

    const { fhirVersion, actualSettings } = normalizeReferenceValidationArgs(
      fhirClientOrVersion,
      fhirVersionOrSettings,
      settings,
    );
    resourceType = resourceType || resource.resourceType || 'Unknown';

    logger.debug(`[ReferenceValidator] Validating ${resourceType} references...`);

    try {
      if (fhirVersion === 'R6') {
        issues = addR6WarningIfNeeded(issues, fhirVersion, 'reference');
      }

      const extractedRefs = extractReferences(resource, resourceType);
      if (extractedRefs.length === 0) {
        logger.debug(`[ReferenceValidator] No references found in ${resourceType}`);
        return issues;
      }

      logger.debug(`[ReferenceValidator] Found ${extractedRefs.length} references to validate`);
      const referencePathsByValue = buildReferencePathsByValue(extractedRefs);
      issues.push(...validateExtractedReferences(extractedRefs, resourceType, this.constraintValidator));
      issues.push(...await this.validateContainedReferences(resource, resourceType));
      issues.push(...await this.validateRecursiveReferences(
        resource,
        resourceType,
        actualSettings,
        referencePathsByValue,
        createResourceFetcher(fhirClientOrVersion),
      ));

      const validationTime = Date.now() - startTime;
      const logReferenceResult = validationTime > 100 ? logger.info.bind(logger) : logger.debug.bind(logger);
      logReferenceResult(
        `[ReferenceValidator] Validated ${resourceType} references in ${validationTime}ms ` +
        `(${issues.length} issues)`
      );

      return issues;

    } catch (error) {
      logger.error('[ReferenceValidator] Error validating references:', error);

      issues.push(createReferenceValidationIssue({
        code: 'reference-validation-error',
        severity: 'error',
        message: `Reference validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        humanReadable: 'Reference validation encountered an error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          resourceType
        },
        resourceType
      }));

      return issues;
    }
  }

  private async validateRecursiveReferences(
    resource: any,
    resourceType: string,
    settings: ValidationSettings | undefined,
    referencePathsByValue: Map<string, string[]>,
    resourceFetcher?: (reference: string) => Promise<any>,
  ): Promise<ValidationIssue[]> {
    const recursiveConfig = getRecursiveValidationConfig(settings);
    if (!recursiveConfig.enabled) return [];

    logger.debug(`[ReferenceValidator] Recursive validation enabled (maxDepth: ${recursiveConfig.maxDepth})`);
    try {
      const recursiveResult = await this.recursiveValidator.validateRecursively(resource, recursiveConfig, resourceFetcher);
      const issueResult = recursiveConfig.validateExternal
        ? recursiveResult
        : { ...recursiveResult, unresolvedReferences: [] };
      const issues = buildRecursiveReferenceIssues(issueResult, recursiveConfig.timeoutMs, resourceType, referencePathsByValue);

      logger.debug(
        `[ReferenceValidator] Recursive validation: ${recursiveResult.totalResourcesValidated} resources, ` +
        `depth ${recursiveResult.maxDepthReached}, ${recursiveResult.referencesFollowed} refs followed` +
        (recursiveResult.timedOut ? ' (TIMED OUT)' : '')
      );
      return issues;
    } catch (recursiveError) {
      logger.error('[ReferenceValidator] Recursive validation error:', recursiveError);
      return [];
    }
  }

  private async validateContainedReferences(resource: any, resourceType: string): Promise<ValidationIssue[]> {
    return validateContainedReferenceIssues(resource, resourceType);
  }

  public extractResourceType(reference: string): string | null {
    return this.referenceTypeExtractor.extractResourceType(reference);
  }

  public parseReference(reference: string) {
    return this.referenceTypeExtractor.parseReference(reference);
  }

  public validateReferenceTypeConstraint(reference: string, resourceType: string, fieldPath: string) {
    return this.constraintValidator.validateReferenceType(reference, resourceType, fieldPath);
  }

  public hasTypeConstraints(resourceType: string, fieldPath: string) {
    return this.constraintValidator.hasConstraints(resourceType, fieldPath);
  }

  public getFieldConstraints(resourceType: string, fieldPath: string) {
    return this.constraintValidator.getConstraintsForField(resourceType, fieldPath);
  }

  public resolveContainedReference(reference: string, parentResource: any, expectedType?: string) {
    return this.containedResolver.resolveContainedReference(reference, parentResource, expectedType);
  }

  public getContainedResources(resource: any) {
    return this.containedResolver.extractContainedResources(resource);
  }

  public validateContainedReferencesSync(resource: any) {
    return validateContainedReferenceIssues(resource);
  }

  public resolveBundleReference(reference: string, bundle: any) {
    return this.bundleResolver.resolveBundleReference(reference, bundle);
  }

  public validateBundleReferences(bundle: any) {
    const result = this.bundleResolver.validateBundleReferences(bundle);
    return result.issues || [];
  }

  public detectCircularReferences(resource: any, startingReferences?: string[]) {
    return this.circularDetector.detectCircularReferences(resource, startingReferences);
  }

  public wouldCreateCircularReference(currentPath: string[], newReference: string) {
    return this.circularDetector.wouldCreateCircularReference(currentPath, newReference);
  }

  public getRecursiveValidationConfig(settings?: ValidationSettings) {
    return getRecursiveValidationConfig(settings);
  }

  public estimateRecursiveValidationCost(..._args: any[]) {
    return {
      estimatedResources: 0,
      estimatedReferences: 0,
      estimatedTimeMs: 0,
      maxDepth: 0,
      feasible: true
    };
  }

  public validateRecursively(resource: any, config?: any, resourceFetcher?: (ref: string) => Promise<any>) {
    return this.recursiveValidator.validateRecursively(resource, config, resourceFetcher);
  }

  public parseVersionedReference(reference: string) {
    return this.versionValidator.parseVersionedReference(reference);
  }

  public validateVersionedReference(reference: string) {
    return this.versionValidator.validateVersionedReference(reference);
  }

  public checkVersionConsistency(references: string[]) {
    return this.versionValidator.checkVersionConsistency(references);
  }

  public extractVersionedReferences(resource: any) {
    return this.versionValidator.extractVersionedReferences(resource);
  }

  public validateBundleVersionIntegrity(bundle: any) {
    return this.versionValidator.validateBundleVersionIntegrity(bundle);
  }

  public parseCanonicalUrl(canonical: string) {
    return this.canonicalValidator.parseCanonicalUrl(canonical);
  }

  public validateCanonicalUrl(canonical: string) {
    return this.canonicalValidator.validateCanonicalUrl(canonical);
  }

  public validateProfileCanonical(canonical: string) {
    return this.canonicalValidator.validateProfileCanonical(canonical);
  }

  public validateValueSetCanonical(canonical: string) {
    return this.canonicalValidator.validateValueSetCanonical(canonical);
  }

  public extractCanonicalUrls(resource: any) {
    return this.canonicalValidator.extractCanonicalUrls(resource);
  }

  public validateResourceCanonicals(resource: any) {
    return this.canonicalValidator.validateResourceCanonicals(resource);
  }

  public validateBundleCanonicals(bundle: any) {
    return this.canonicalValidator.validateBundleCanonicals(bundle);
  }

  public async checkBatchReferences(references: any[], config?: any) {
    return this.batchedChecker.checkBatch(references, config);
  }

  public async checkResourceReferences(resource: any, config?: any) {
    return this.batchedChecker.checkResourceReferences(resource, config);
  }

  public checkBundleReferenceExistence(bundle: any, config?: any) {
    return this.batchedChecker.checkBundleReferences(bundle, config);
  }

  public filterExistingReferences(references: string[], config?: any) {
    return this.batchedChecker.filterExistingReferences(references, config);
  }
}

function createResourceFetcher(fhirClientOrVersion: any): ((reference: string) => Promise<any>) | undefined {
  if (!fhirClientOrVersion || typeof fhirClientOrVersion !== 'object') return undefined;
  if (typeof fhirClientOrVersion.getResource !== 'function') return undefined;

  return async (reference: string) => {
    const parsed = parseReference(reference);
    if (!parsed.isValid || !parsed.resourceType || !parsed.resourceId) return null;
    return fhirClientOrVersion.getResource(parsed.resourceType, parsed.resourceId);
  };
}
