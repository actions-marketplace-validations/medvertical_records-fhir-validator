/**
 * Profile Executor
 * 
 * Validates FHIR profile conformance:
 * - StructureDefinition conformance
 * - Extension validation
 * - Slicing validation
 * - Profile constraint validation
 */

import type { ValidationIssue } from '../../types';
import type { StructureDefinition } from '../structure-definition-types';
import type { ExtensionValidator } from '../../validators/extension-validator';
import type { SlicingValidator, ReferenceResolver } from '../../validators/slicing-validator';
import type { ConstraintValidator } from '../../validators/constraint-validator';
import { GermanIdentifierValidator } from '../../validators/german-identifier-validator';
import { GermanExtensionValidator } from '../../validators/german-extension-validator';
import { logger } from '../../logger';
import { createExecutorFailureIssue } from './executor-failure-issue';
import { ProfileSlicingValidation } from './profile-slicing-validation';

// ============================================================================
// Types
// ============================================================================

export interface ProfileValidationContext {
  resource: unknown;
  resourceType: string;
  profileUrl: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  structureDef: StructureDefinition;
  strictMode: boolean;
  getValueAtPath: (resource: unknown, path: string) => unknown;
  referenceResolver?: ReferenceResolver | null;
  enclosingBundle?: Record<string, unknown>;
}

// ============================================================================
// Profile Executor
// ============================================================================

export class ProfileExecutor {
  private extensionValidator: ExtensionValidator;
  private profileSlicingValidation: ProfileSlicingValidation;
  private constraintValidator: ConstraintValidator;
  private germanIdentifierValidator: GermanIdentifierValidator;
  private germanExtensionValidator: GermanExtensionValidator;

  constructor(
    extensionValidator: ExtensionValidator,
    slicingValidator: SlicingValidator,
    constraintValidator: ConstraintValidator
  ) {
    this.extensionValidator = extensionValidator;
    this.profileSlicingValidation = new ProfileSlicingValidation(slicingValidator);
    this.constraintValidator = constraintValidator;
    this.germanIdentifierValidator = new GermanIdentifierValidator();
    this.germanExtensionValidator = new GermanExtensionValidator();
  }

  /**
   * Validate profile conformance aspects
   */
  async validate(
    context: ProfileValidationContext
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      const { resource, structureDef, profileUrl, fhirVersion, strictMode, getValueAtPath, referenceResolver, enclosingBundle } = context;
      this.profileSlicingValidation.setMustSupportSeverity(
        strictMode ? 'warning' : 'information',
      );

      // 1. Validate extensions
      const extensionIssues = await this.extensionValidator.validateExtensions(
        resource,
        structureDef,
        {
          resource,
          profileSD: structureDef,
          strictMode,
          fhirVersion,
          profileUrl,
          getValueAtPath
        }
      );

      // 2. Validate slicing (check for sliced elements like Patient.identifier)
      if (structureDef.snapshot?.element) {
        issues.push(...await this.profileSlicingValidation.validate({
          extensionIssues,
          resource,
          structureDef,
          getValueAtPath,
          referenceResolver,
          fhirVersion,
        }));

        // 3. Validate FHIRPath constraints
        // Using snapshot elements which contain the constraints
        const constraintIssues = await this.constraintValidator.validate(
          resource,
          structureDef.snapshot.element,
          profileUrl,
          { strictMode, fhirVersion, bundle: enclosingBundle } // Pass strictMode + FHIR version + Bundle context
        );
        issues.push(...constraintIssues);
      } else {
        issues.push(...extensionIssues);
      }

      // 4. Validate German identifier systems (GKV/PKV assigner validation)
      if (this.germanIdentifierValidator.isGermanProfile(profileUrl)) {
        const germanIdIssues = this.germanIdentifierValidator.validateIdentifiers(
          resource,
          profileUrl
        );
        issues.push(...germanIdIssues);

        // 5. Validate German extension requirements (gender extension for "other")
        const germanExtIssues = this.germanExtensionValidator.validateExtensions(
          resource,
          profileUrl
        );
        issues.push(...germanExtIssues);
      }

      return issues;

    } catch {
      logger.error('[ProfileExecutor] Validation failed');
      return [createExecutorFailureIssue('profile', 'Profile')];
    }
  }

}
