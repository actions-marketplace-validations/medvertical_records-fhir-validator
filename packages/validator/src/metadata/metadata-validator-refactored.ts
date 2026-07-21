import type { ValidationContext, ValidationIssue } from '../types';
import type { ValidationResult } from '@records-fhir/validation-types';
/**
 * Structural shape of the host's HAPI validation coordinator. The
 * full implementation lives server-side and depends on the HAPI
 * process pool; the engine only consumes the
 * `getIssuesByAspect()` lookup, so we keep the type local to avoid
 * pulling the coordinator's full surface (and its Java-runtime
 * dependencies) into the standalone package.
 */
interface HapiValidationCoordinator {
  getIssuesByAspect(resourceId: string, aspect: string): ValidationIssue[];
}
interface RecordsMetadataValidator {
  isAvailable(): boolean;
  validateMetadata(resource: unknown): Promise<ValidationIssue[]>;
}
import { validateRequiredMetadata } from './completeness-checker';
import {
  LastUpdatedValidator,
  VersionIdValidator,
  SourceValidator
} from './field-validators';
import { ProfileValidator } from './profile-validators';
import { SecurityValidator } from './security-validators';
import { TagValidator } from './tag-validators';
import { validateProvenanceChain } from './provenance-chain-validator';
import { logger } from '../logger';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function buildInvalidResourceIssue(
  resource: unknown,
  resourceType: string,
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
): ValidationIssue {
  return {
    id: `metadata-invalid-resource-${Date.now()}`,
    aspect: 'metadata',
    severity: 'error',
    code: 'metadata-invalid-resource',
    message: 'Resource must be a valid JSON object',
    path: resourceType || 'Resource',
    humanReadable: 'Metadata validation requires a FHIR resource object',
    details: {
      actualType: resource === null ? 'null' : Array.isArray(resource) ? 'array' : typeof resource,
      resourceType,
      validationType: 'metadata-resource-validation',
    },
    validationMethod: 'metadata-resource-validation',
    timestamp: new Date().toISOString(),
    resourceType,
    schemaVersion: fhirVersion,
  };
}

async function loadRecordsMetadataValidator(): Promise<RecordsMetadataValidator | null> {
  try {
    // Lazy import to avoid circular dependency with records-validator. Keep the
    // explicit file target so Node ESM never treats the package dist directory as
    // a module entrypoint at runtime.
    const { recordsValidator } = await import('../index.js');
    return recordsValidator;
  } catch (error) {
    logger.warn(
      `[MetadataValidator] Records metadata engine unavailable; falling back to local metadata rules: ${getErrorMessage(error)}`
    );
    return null;
  }
}

async function validateWithRecordsMetadataValidator(resource: unknown): Promise<ValidationIssue[] | null> {
  const recordsValidator = await loadRecordsMetadataValidator();
  if (!recordsValidator) return null;

  try {
    if (!recordsValidator.isAvailable()) return null;

    logger.debug(`[MetadataValidator] Using Records validator...`);

    const metadataTimeout = 10000;
    const validationPromise = recordsValidator.validateMetadata(resource);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<ValidationIssue[]>((_, reject) => {
      timeoutId = setTimeout(() => {
        logger.warn(`[MetadataValidator] Metadata validation timeout after ${metadataTimeout}ms`);
        reject(new Error(`Metadata validation timeout after ${metadataTimeout}ms`));
      }, metadataTimeout);
    });

    try {
      return await Promise.race([validationPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  } catch (error) {
    logger.warn(
      `[MetadataValidator] Records metadata validation failed; falling back to local metadata rules: ${getErrorMessage(error)}`
    );
    return null;
  }
}

export class MetadataValidator {
  private lastUpdatedValidator: LastUpdatedValidator;
  private versionIdValidator: VersionIdValidator;
  private sourceValidator: SourceValidator;
  private profileValidator: ProfileValidator;
  private securityValidator: SecurityValidator;
  private tagValidator: TagValidator;

  constructor() {
    this.lastUpdatedValidator = new LastUpdatedValidator();
    this.versionIdValidator = new VersionIdValidator();
    this.sourceValidator = new SourceValidator();
    this.profileValidator = new ProfileValidator();
    this.securityValidator = new SecurityValidator();
    this.tagValidator = new TagValidator();
  }

  async validate(
    resource: any,
    resourceTypeOrContext: string | ValidationContext,
    fhirVersion?: 'R4' | 'R5' | 'R6',
    coordinator?: HapiValidationCoordinator,
    settings?: any,
    profileUrl?: string
  ): Promise<ValidationIssue[] | ValidationResult> {
    if (typeof resourceTypeOrContext === 'object') {
      const context = resourceTypeOrContext as ValidationContext;
      const startTime = Date.now();
      const version = context.fhirVersion || 'R4';

      const issues = await this.validateInternal(
        resource,
        context.resourceType,
        version
      );

      const validationTime = Date.now() - startTime;
      const isValid = issues.length === 0 || !issues.some(i => i.severity === 'error');

      return {
        resourceId: context.resourceId || resource?.id || 'unknown',
        resourceType: context.resourceType,
        isValid,
        issues,
        aspects: [{
          aspect: 'metadata',
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

    return this.validateInternal(
      resource,
      resourceTypeOrContext as string,
      fhirVersion,
      coordinator,
      settings,
      profileUrl
    );
  }

  async validateInternal(
    resource: any,
    resourceType: string,
    _fhirVersion?: 'R4' | 'R5' | 'R6',
    coordinator?: HapiValidationCoordinator,
    settings?: any,
    profileUrl?: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const startTime = Date.now();

    if (typeof resource !== 'object' || resource === null || Array.isArray(resource)) {
      return [buildInvalidResourceIssue(resource, resourceType, _fhirVersion)];
    }

    logger.debug(`[MetadataValidator] Validating ${resourceType} resource metadata...`);

    try {
      // Local metadata checks are the default. Delegating back into the global
      // Records validator from inside Records validation is redundant and can
      // stall batch runs while initialization or fallback timers settle.
      const engine = settings?.aspects?.metadata?.engine || 'local';

      if (engine === 'records') {
        const recordsIssues = await validateWithRecordsMetadataValidator(resource);
        if (recordsIssues) {
          return recordsIssues;
        }
      }

      if (coordinator) {
        const resourceId = `${resource.resourceType}/${resource.id}`;
        const coordinatorIssues = coordinator.getIssuesByAspect(resourceId, 'metadata');

        if (coordinatorIssues.length > 0) {
          logger.info(`[MetadataValidator] Using ${coordinatorIssues.length} issues from coordinator`);
          const validationTime = Date.now() - startTime;
          logger.info(
            `[MetadataValidator] Validated ${resourceType} metadata in ${validationTime}ms ` +
            `(${coordinatorIssues.length} issues, source: coordinator)`
          );
          return coordinatorIssues;
        }
      }

      const metaIssues = this.validateMetaField(resource, resourceType);
      issues.push(...metaIssues);

      const requiredMetadataIssues = validateRequiredMetadata(resource, resourceType);
      issues.push(...requiredMetadataIssues);

      // Validate Provenance chain linkage (Provenance.target/recorded/agent
      // structure). Runs even if `meta` is absent, since Provenance does not
      // require a populated `meta` field.
      if (resourceType === 'Provenance') {
        const provenanceIssues = validateProvenanceChain(resource);
        issues.push(...provenanceIssues);
      }

      if (!resource.meta) {
        return issues;
      }

      if (resource.meta.lastUpdated) {
        const lastUpdatedIssues = this.lastUpdatedValidator.validate(
          resource.meta.lastUpdated,
          resourceType,
          profileUrl
        );
        issues.push(...lastUpdatedIssues);
      }

      if (resource.meta.versionId !== undefined && resource.meta.versionId !== null) {
        const versionIdFormatIssues = this.versionIdValidator.validateFormat(
          resource.meta.versionId,
          resourceType,
          profileUrl
        );
        issues.push(...versionIdFormatIssues);

        const versionIdConsistencyIssues = this.versionIdValidator.validateConsistency(
          resource,
          resourceType,
          profileUrl
        );
        issues.push(...versionIdConsistencyIssues);
      }

      if (resource.meta.profile !== undefined && resource.meta.profile !== null) {
        const profileUrlIssues = this.profileValidator.validateUrls(
          resource.meta.profile,
          resourceType
        );
        issues.push(...profileUrlIssues);
      }

      if (resource.meta.security !== undefined && resource.meta.security !== null) {
        const securityIssues = this.securityValidator.validate(
          resource.meta.security,
          resourceType
        );
        issues.push(...securityIssues);
      }

      if (resource.meta.tag !== undefined && resource.meta.tag !== null) {
        const tagIssues = this.tagValidator.validate(
          resource.meta.tag,
          resourceType
        );
        issues.push(...tagIssues);
      }

      if (resource.meta.source !== undefined && resource.meta.source !== null) {
        const sourceIssues = this.sourceValidator.validate(
          resource.meta.source,
          resourceType
        );
        issues.push(...sourceIssues);
      }

      const validationTime = Date.now() - startTime;
      logger.info(`[MetadataValidator] Validated ${resourceType} metadata in ${validationTime}ms, found ${issues.length} issues`);

    } catch (error) {
      logger.error('[MetadataValidator] Metadata validation failed:', error);
      throw error;
    }

    return issues;
  }

  async validateProfileAccessibility(
    profiles: any,
    resourceType: string,
    _fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    if (!profiles || (Array.isArray(profiles) && profiles.length === 0)) {
      return issues;
    }

    if (!Array.isArray(profiles)) {
      return issues;
    }

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      if (typeof profile !== 'string') {
        continue;
      }
    }

    return issues;
  }

  private validateMetaField(resource: any, resourceType: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!resource.meta) {
      issues.push({
        id: `metadata-missing-meta-${Date.now()}`,
        aspect: 'metadata',
        severity: 'warning',
        code: 'missing-meta',
        message: 'Resource should have a meta field',
        path: 'meta',
        humanReadable: 'The resource should include metadata information',
        details: {
          fieldPath: 'meta',
          resourceType: resourceType,
          validationType: 'metadata-field-validation'
        },
        validationMethod: 'metadata-field-validation',
        timestamp: new Date().toISOString(),
        resourceType: resourceType,
        schemaVersion: 'R4'
      });
      return issues;
    }

    if (typeof resource.meta !== 'object' || Array.isArray(resource.meta)) {
      issues.push({
        id: `metadata-invalid-meta-type-${Date.now()}`,
        aspect: 'metadata',
        severity: 'error',
        code: 'invalid-meta-type',
        message: 'Meta field must be an object',
        path: 'meta',
        humanReadable: 'The meta field must be an object containing metadata information',
        details: {
          fieldPath: 'meta',
          actualValue: resource.meta,
          expectedType: 'object',
          resourceType: resourceType,
          validationType: 'metadata-field-validation'
        },
        validationMethod: 'metadata-field-validation',
        timestamp: new Date().toISOString(),
        resourceType: resourceType,
        schemaVersion: 'R4'
      });
    }

    return issues;
  }
}
