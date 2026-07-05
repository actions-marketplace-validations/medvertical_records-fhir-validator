/**
 * Validation Orchestrator
 * 
 * Orchestrates validation across all aspect executors.
 * Extracted from validator-engine.ts to comply with global.mdc guidelines.
 */

import type { ValidationIssue } from '../types';
import type { StructureDefinition } from './structure-definition-types';
import {
  StructuralExecutor,
  ProfileExecutor,
  TerminologyExecutor,
  ReferenceExecutor,
  InvariantExecutor,
  CustomRuleExecutor,
  MetadataExecutor
} from './executors';
import { getValueAtPath } from './validation-utils';
import { terminologyResourceValidator } from '../validators/terminology-resource-validator';
import type { ReferenceResolver } from '../validators/slicing-validator';

export interface ValidationOrchestratorContext {
  resource: any;
  resourceType: string;
  profileUrl: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  structureDef: StructureDefinition;
  strictMode: boolean;
  settings?: any;
  referenceResolver?: ReferenceResolver | null;
  contextQuestionnaire?: any;
}

/**
 * Run all aspect validations and collect issues
 */
export async function runAllAspectValidations(
  context: ValidationOrchestratorContext,
  structuralExecutor: StructuralExecutor,
  profileExecutor: ProfileExecutor,
  terminologyExecutor: TerminologyExecutor,
  invariantExecutor: InvariantExecutor,
  customRuleExecutor: CustomRuleExecutor,
  metadataExecutor: MetadataExecutor,
  referenceExecutor?: ReferenceExecutor
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Structural validation (cardinality, types, element rules)
  if (isAspectEnabled(context.settings, 'structural')) {
    const structuralIssues = await structuralExecutor.validate(
      context.resource,
      {
        resource: context.resource,
        resourceType: context.resourceType,
        profileUrl: context.profileUrl,
        fhirVersion: context.fhirVersion,
        structureDef: context.structureDef,
        getValueAtPath,
        contextQuestionnaire: context.contextQuestionnaire,
        settings: context.settings
      }
    );
    issues.push(...structuralIssues);
  }

  // Profile validation (extensions, slicing)
  if (isAspectEnabled(context.settings, 'profile')) {
    const profileIssues = await profileExecutor.validate({
      resource: context.resource,
      resourceType: context.resourceType,
      profileUrl: context.profileUrl,
      fhirVersion: context.fhirVersion,
      structureDef: context.structureDef,
      strictMode: context.strictMode,
      getValueAtPath,
      referenceResolver: context.referenceResolver,
    });
    issues.push(...profileIssues);
  }

  // Terminology validation (value set bindings)
  if (isAspectEnabled(context.settings, 'terminology')) {
    const terminologyIssues = await terminologyExecutor.validate({
      resource: context.resource,
      structureDef: context.structureDef,
      getValueAtPath,
      fhirVersion: context.fhirVersion
    });
    issues.push(...terminologyIssues);

    // Terminology resource business rules (CodeSystem/ValueSet canonical URLs,
    // caseSensitive, concept definitions, compose.include validation)
    const terminologyResourceIssues = terminologyResourceValidator.validate(
      context.resource,
    );
    issues.push(...terminologyResourceIssues);
  }

  // Invariant validation (FHIRPath constraints)
  if (isAspectEnabled(context.settings, 'invariant')) {
    const invariantIssues = await invariantExecutor.validate({
      resource: context.resource,
      structureDef: context.structureDef,
      profileUrl: context.profileUrl,
      existingIssues: issues
    });
    issues.push(...invariantIssues);
  }

  // Custom Rule validation (User-defined business rules)
  if (isAspectEnabled(context.settings, 'custom_rule')) {
    const customRuleIssues = await customRuleExecutor.validate({
      resource: context.resource,
      structureDef: context.structureDef
    });
    issues.push(...customRuleIssues);
  }

  // Reference validation (contained references, type constraints)
  // Only runs if a referenceExecutor was provided (the single-resource
  // validate() path wires it in; the multi-aspect batch path runs its
  // own reference pass via the callback).
  if (referenceExecutor && isAspectEnabled(context.settings, 'reference')) {
    const referenceIssues = await referenceExecutor.validate({
      resource: context.resource,
      fhirVersion: context.fhirVersion,
      settings: context.settings
    });
    issues.push(...referenceIssues);
  }

  // Metadata validation
  if (isAspectEnabled(context.settings, 'metadata')) {
    const metadataIssues = await metadataExecutor.validate({
      resource: context.resource
    }, context.profileUrl);
    issues.push(...metadataIssues);
  }

  return issues;
}

function isAspectEnabled(
  settings: ValidationOrchestratorContext['settings'],
  aspect: 'structural' | 'profile' | 'terminology' | 'reference' | 'invariant' | 'custom_rule' | 'metadata',
): boolean {
  return settings?.aspects?.[aspect]?.enabled !== false;
}
