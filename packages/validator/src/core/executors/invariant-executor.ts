/**
 * Invariant Executor
 * 
 * Validates standard invariant constraints:
 * - FHIRPath constraint validation
 * - Element rules validation
 */

import type { ValidationIssue } from '../../types';
import type { StructureDefinition } from '../structure-definition-types';
import { resourceSpecificConstraintsValidator } from '../../validators/resource-specific-constraints-validator';
import { logger } from '../../logger';
import { createExecutorFailureIssue } from './executor-failure-issue';
import { profileCanonicalMetadata } from '../../utils/sensitive-logging-metadata';
import { resourceTypeOf } from '../fhir-resource';

// ============================================================================
// Types
// ============================================================================

export interface InvariantValidationContext {
  resource: unknown;
  structureDef: StructureDefinition;
  profileUrl: string;
  existingIssues?: ValidationIssue[];
}

// ============================================================================
// Invariant Executor
// ============================================================================

export class InvariantExecutor {
  constructor() {
    // ConstraintValidator has been fundamentally relocated to ProfileExecutor
    // to strictly categorize FHIRPath base rules to the 'profile' bucket (HAPI parity)
  }

  /**
   * Validate invariant rules
   * Note: Standard FHIRPath invariants are now evaluated in the profile aspect.
   * This executor is currently a semantic anchor for the invariant bucket to maintain 
   * aspect parity if future non-resource-specific invariants are needed.
   */
  async validate(
    context: InvariantValidationContext
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      const { resource, profileUrl, existingIssues = [] } = context;
      
      logger.debug('[InvariantExecutor] Validating invariant aspect', {
        resourceType: resourceTypeOf(resource),
        ...profileCanonicalMetadata(profileUrl),
      });

      // Resource-specific hand-coded constraint validators (obs-3/6/7, ait-1/2, cmp-1/2, etc.)
      // These replace FHIRPath evaluation for well-known constraints with more specific error codes.
      const resourceIssues = resourceSpecificConstraintsValidator.validate(resource, existingIssues, profileUrl);
      issues.push(...resourceIssues);

      return issues;

    } catch {
      logger.error('[InvariantExecutor] Validation failed');
      return [createExecutorFailureIssue('invariant', 'Invariant')];
    }
  }
}
