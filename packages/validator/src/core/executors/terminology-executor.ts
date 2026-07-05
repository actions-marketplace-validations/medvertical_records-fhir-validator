/**
 * Terminology Executor
 * 
 * Validates terminology bindings:
 * - ValueSet binding validation
 * - CodeSystem validation
 * - Terminology expansion
 * - Binding strength enforcement
 */

import type { ValidationIssue } from '../../types';
import type { ElementDefinition, StructureDefinition } from '../structure-definition-types';
import { ValueSetValidator, type TerminologyResolutionConfig } from '../../validators/valueset-validator';
import { getValidationTargets, shouldValidateRequired } from '../../business-rules';
import { logger } from '../../logger';
import { expandContentReferenceElements } from '../content-reference-elements';
import {
  UCUM_BEARING_TYPES,
  validateUcumAtPath,
} from './terminology-ucum-rules';
import {
  validateKnownLoincDisplays,
} from './terminology-display-rules';
import { validateExternalCodeSystems } from './terminology-external-code-system-rules';
import {
  effectiveBindingForElement,
  selectSliceScopedValues,
  selectValuesForBinding,
  shouldSuppressNonRequiredBindingForOwnFixedPattern,
  shouldSuppressValueSetSliceMembershipIssue,
  shouldValidateBindingForValue,
} from './terminology-binding-selection';
import { validateCodingHygiene } from './terminology-coding-hygiene-rules';
import { createValidationIssue } from '../../issues';
import { computeValidationIssueId } from '@records-fhir/validation-types';

// ============================================================================
// Types
// ============================================================================

export interface TerminologyValidationContext {
  resource: any;
  structureDef: StructureDefinition;
  getValueAtPath: (resource: any, path: string) => any;
  fhirVersion?: 'R4' | 'R5' | 'R6';
}

// ============================================================================
// Terminology Executor
// ============================================================================

export class TerminologyExecutor {
  private valuesetValidator: ValueSetValidator;

  constructor() {
    this.valuesetValidator = new ValueSetValidator();
  }

  /**
   * Configure terminology resolution strategy
   * Call this when settings change to update the underlying ValueSetValidator
   */
  configureResolution(config: Partial<TerminologyResolutionConfig>): void {
    this.valuesetValidator.setResolutionConfig(config);
    logger.info(`[TerminologyExecutor] Resolution configured: strategy=${config.strategy}`);
  }

  /**
   * Get current resolution configuration
   */
  getResolutionConfig(): TerminologyResolutionConfig {
    return this.valuesetValidator.getResolutionConfig();
  }

  /**
   * Clear caches (call on settings change)
   */
  clearCache(): void {
    this.valuesetValidator.clearCache();
    logger.info('[TerminologyExecutor] Cache cleared');
  }

  /**
   * Validate terminology bindings
   */
  async validate(
    context: TerminologyValidationContext
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      const { resource, structureDef, getValueAtPath } = context;
      const profileUrl = structureDef.url;
      const fhirVersion = context.fhirVersion ?? 'R4';

      if (structureDef.snapshot?.element) {
        for (const elementDef of expandContentReferenceElements(structureDef.snapshot.element)) {
          issues.push(...await this.validateElementDefinition({
            resource,
            elementDef,
            structureDef,
            getValueAtPath,
            profileUrl,
            fhirVersion,
          }));
        }
      }

      issues.push(...validateKnownLoincDisplays(resource));
      issues.push(...validateCodingHygiene(resource, issues));

      return issues;

    } catch (error) {
      logger.error('[TerminologyExecutor] Validation error:', error);
      return [createValidationIssue({
        code: 'validation-error',
        path: '',
        resourceType: context.resource?.resourceType || context.structureDef?.type || 'Resource',
        aspectOverride: 'terminology',
        severityOverride: 'error',
        customMessage: `Terminology validation failed: ${error instanceof Error ? error.message : String(error)}`,
      })];
    }
  }

  private async validateElementDefinition(params: {
    resource: any;
    elementDef: ElementDefinition;
    structureDef: StructureDefinition;
    getValueAtPath: (resource: any, path: string) => any;
    profileUrl?: string;
    fhirVersion: 'R4' | 'R5' | 'R6';
  }): Promise<ValidationIssue[]> {
    const { resource, elementDef, structureDef, getValueAtPath, profileUrl, fhirVersion } = params;
    const issues: ValidationIssue[] = [];

    if (elementDef.binding) {
      issues.push(...await this.validateElementBinding({
        resource,
        elementDef,
        structureDef,
        getValueAtPath,
        profileUrl,
        fhirVersion,
      }));
    }

    const path = elementDef.path;
    const elementTypes = elementDef.type?.map(t => t.code) || [];
    const isCodeableConcept = elementTypes.includes('CodeableConcept');
    const isCodingType = elementTypes.includes('Coding');

    if (isCodeableConcept) {
      const targets = getValidationTargets(resource, path)
        .filter(target => target.value !== null && target.value !== undefined);
      for (const target of targets) {
        const concept = target.value;
        if (!concept || typeof concept !== 'object' || !Array.isArray(concept.coding)) {
          continue;
        }
        issues.push(...await validateExternalCodeSystems(
          concept.coding,
          `${target.fullPath}.coding`,
          this.valuesetValidator,
          fhirVersion,
        ));
      }
    } else if (isCodingType) {
      const targets = getValidationTargets(resource, path)
        .filter(target => target.value !== null && target.value !== undefined);
      for (const target of targets) {
        issues.push(...await validateExternalCodeSystems(
          target.value,
          target.fullPath,
          this.valuesetValidator,
          fhirVersion,
        ));
      }
    }

    const hasUcumBearingType = elementTypes.some(t => UCUM_BEARING_TYPES.has(t));
    const isPolymorphicWithQuantity = path.endsWith('[x]') && hasUcumBearingType;
    if (hasUcumBearingType || isPolymorphicWithQuantity) {
      issues.push(...validateUcumAtPath(resource, elementDef, path));
    }

    return issues;
  }

  private async validateElementBinding(params: {
    resource: any;
    elementDef: ElementDefinition;
    structureDef: StructureDefinition;
    getValueAtPath: (resource: any, path: string) => any;
    profileUrl?: string;
    fhirVersion: 'R4' | 'R5' | 'R6';
  }): Promise<ValidationIssue[]> {
    const { resource, elementDef, structureDef, getValueAtPath, profileUrl, fhirVersion } = params;
    const path = elementDef.path;
    const sliceSelection = selectSliceScopedValues(resource, elementDef, structureDef, getValueAtPath);
    if (sliceSelection && !sliceSelection.hasMatchingSliceElements) return [];

    const value = sliceSelection
      ? (sliceSelection.values.length === 0
          ? undefined
          : sliceSelection.values.length === 1 ? sliceSelection.values[0] : sliceSelection.values)
      : getValueAtPath(resource, path);

    if (elementDef.binding?.strength === 'required' && (elementDef.min ?? 0) > 0) {
      const shouldReportMissingRequiredBinding = (value === null || value === undefined) &&
        shouldValidateRequired(resource, path) &&
        (Boolean(sliceSelection) || isDirectResourceElementPath(path, resource?.resourceType || structureDef.type));

      if (shouldReportMissingRequiredBinding) {
        const resourceType = resource?.resourceType || structureDef.type || 'Resource';
        const message = `Required binding for '${path}' is missing (binding strength: required)`;
        const details = {
          bindingStrength: 'required',
          fieldPath: path,
        };
        return [{
          id: computeValidationIssueId({
            aspect: 'terminology',
            severity: 'error',
            code: 'binding-required-missing',
            path,
            resourceType,
            message,
            profile: profileUrl,
            details,
          }),
          aspect: 'terminology',
          severity: 'error',
          code: 'binding-required-missing',
          message,
          path,
          timestamp: new Date(),
          profile: profileUrl,
          details,
        }];
      }
    }

    if (value === null || value === undefined || !shouldValidateBindingForValue(elementDef, value)) {
      return [];
    }

    const issues: ValidationIssue[] = [];
    const effectiveBinding = effectiveBindingForElement(elementDef);
    if (!sliceSelection) {
      const targets = getValidationTargets(resource, path)
        .filter(target => target.value !== null && target.value !== undefined)
        .filter(target => shouldValidateBindingForValue(elementDef, target.value));

      if (targets.length > 0) {
        for (const target of targets) {
          for (const candidateValue of selectValuesForBinding(elementDef, target.value, structureDef)) {
            if (shouldSuppressNonRequiredBindingForOwnFixedPattern(elementDef, candidateValue)) {
              continue;
            }
            const bindingIssues = await this.valuesetValidator.validateBinding(
              candidateValue,
              effectiveBinding,
              target.fullPath,
              { profileUrl, fhirVersion },
            );
            if (!shouldSuppressValueSetSliceMembershipIssue(elementDef, structureDef, bindingIssues)) {
              issues.push(...bindingIssues);
            }
          }
        }
        return issues;
      }
    }

    for (const candidateValue of selectValuesForBinding(elementDef, value, structureDef)) {
      if (shouldSuppressNonRequiredBindingForOwnFixedPattern(elementDef, candidateValue)) {
        continue;
      }
      const bindingIssues = await this.valuesetValidator.validateBinding(
        candidateValue,
        effectiveBinding,
        path,
        { profileUrl, fhirVersion },
      );
      if (!shouldSuppressValueSetSliceMembershipIssue(elementDef, structureDef, bindingIssues)) {
        issues.push(...bindingIssues);
      }
    }
    return issues;
  }

}

function isDirectResourceElementPath(path: string, resourceType?: string): boolean {
  if (!resourceType) return false;
  const normalizedPath = path.replace(/\[[^\]]+\]/g, '');
  const segments = normalizedPath.split('.').filter(Boolean);
  return segments.length === 2 && segments[0] === resourceType;
}
