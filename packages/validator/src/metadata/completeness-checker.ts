/**
 * Metadata Completeness Checker
 * 
 * Validates that required metadata fields are present based on resource type.
 */

import type { ValidationIssue } from '../types';
import { RESOURCE_METADATA_REQUIREMENTS } from './metadata-types';

/**
 * Validate required metadata based on resource type
 */
export function validateRequiredMetadata(resource: any, resourceType: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const meta = resource?.meta && typeof resource.meta === 'object' && !Array.isArray(resource.meta)
    ? resource.meta
    : null;

  // Get requirements for this resource type
  const requirements = RESOURCE_METADATA_REQUIREMENTS[resourceType];
  
  if (!requirements || requirements.length === 0) {
    // No specific requirements for this resource type
    return issues;
  }

  // Check each requirement
  for (const requirement of requirements) {
    const { field, severity, reason } = requirement;
    
    // Check if the required metadata field is present
    let isPresent = false;
    
    switch (field) {
      case 'versionId':
        isPresent = !!(meta && 'versionId' in meta && meta.versionId);
        break;
      case 'lastUpdated':
        isPresent = !!meta?.lastUpdated;
        break;
      case 'profile':
        isPresent = !!(meta?.profile && Array.isArray(meta.profile) && meta.profile.length > 0);
        break;
      case 'security':
        isPresent = !!(meta?.security && Array.isArray(meta.security) && meta.security.length > 0);
        break;
      case 'tag':
        isPresent = !!(meta?.tag && Array.isArray(meta.tag) && meta.tag.length > 0);
        break;
      case 'source':
        isPresent = !!meta?.source;
        break;
    }

    if (!isPresent) {
      issues.push({
        id: `metadata-required-field-missing-${resourceType}-${field}-${Date.now()}`,
        aspect: 'metadata',
        severity: severity,
        code: `required-metadata-missing-${field}`,
        message: `${resourceType} resource is missing recommended metadata field: meta.${field}`,
        path: `meta.${field}`,
        humanReadable: reason,
        details: {
          fieldPath: `meta.${field}`,
          resourceType: resourceType,
          requiredField: field,
          severity: severity,
          reason: reason,
          validationType: 'required-metadata-check'
        },
        validationMethod: 'required-metadata-check',
        timestamp: new Date().toISOString(),
        resourceType: resourceType,
        schemaVersion: 'R4'
      });
    }
  }

  return issues;
}
