/**
 * Metadata Executor
 * 
 * Validates resource metadata:
 * - Provenance validation
 * - Timestamps (lastUpdated)
 * - Identifiers (versionId)
 * - Meta field structure
 * 
 * Delegates to specialized validators in the package metadata module.
 */

import type { ValidationIssue } from '../../types';
import { logger } from '../../logger';
import { validateRequiredMetadata } from '../../metadata/completeness-checker';
import { validateMetaField } from '../../metadata/meta-field-validator';
import { isObjectRecord } from '../../metadata/metadata-boundary-utils';
import { MetadataFieldRuleSet } from '../../metadata/metadata-field-rule-set';
import { validationFailureMetadata } from '../../utils/validation-execution-failure';

// ============================================================================
// Types
// ============================================================================

export interface MetadataValidationContext {
  resource: unknown;
  resourceType?: string; // Optional in interface, but needed for validation
}

// ============================================================================
// Metadata Executor
// ============================================================================

export class MetadataExecutor {
  private readonly fieldRules = new MetadataFieldRuleSet();

  /**
   * Validate metadata fields
   */
  async validate(
    context: MetadataValidationContext,
    profileUrl?: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      const { resource } = context;
      const resourceRecord = isObjectRecord(resource) ? resource : null;
      const resourceType = context.resourceType ||
        (typeof resourceRecord?.resourceType === 'string'
          ? resourceRecord.resourceType
          : 'Unknown');

      logger.debug(`[MetadataExecutor] Validating ${resourceType} metadata`);

      // Validate meta field existence and structure
      const metaIssues = validateMetaField(resource, resourceType, {
        missingSeverity: 'info',
      });
      issues.push(...metaIssues);

      // Validate required metadata based on resource type
      const requiredMetadataIssues = validateRequiredMetadata(resource, resourceType);
      issues.push(...requiredMetadataIssues);

      // Skip further validation if meta is invalid or missing
      if (!resourceRecord || !isObjectRecord(resourceRecord.meta)) {
        return issues;
      }
      const meta = resourceRecord.meta;

      issues.push(...this.fieldRules.validate(
        resourceRecord,
        meta,
        resourceType,
        profileUrl,
      ));

      logger.debug(`[MetadataExecutor] Metadata validation found ${issues.length} issues`);
      return issues;

    } catch (error) {
      logger.error('[MetadataExecutor] Validation error', validationFailureMetadata(error));
      throw error;
    }
  }

}
