/**
 * Validation Orchestrator
 * 
 * Orchestrates validation across all aspect executors.
 * Extracted from validator-engine.ts to comply with global.mdc guidelines.
 */

import type { ValidationIssue, ValidationSettings } from '../types';
import { computeValidationIssueId } from '@records-fhir/validation-types';
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
import type { ReferenceResolver } from '../validators/slicing-validator';
import { TerminologyResourceValidator } from '../validators/terminology-resource-validator';
import type { FhirResource } from './fhir-resource';

export interface ValidationOrchestratorContext {
  resource: FhirResource;
  resourceType: string;
  profileUrl: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  structureDef: StructureDefinition;
  strictMode: boolean;
  settings?: ValidationSettings;
  referenceResolver?: ReferenceResolver | null;
  contextQuestionnaire?: unknown;
  organizationId?: number;
  serverId?: number;
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
  referenceExecutor: ReferenceExecutor | undefined,
  composedTerminologyResourceValidator: TerminologyResourceValidator,
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
        settings: context.settings,
        referenceResolver: context.referenceResolver,
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
      fhirVersion: context.fhirVersion,
      sourceContext: {
        organizationId: context.organizationId,
        serverId: context.serverId,
        fhirVersion: context.fhirVersion,
      },
    });
    issues.push(...terminologyIssues);

    // Terminology resource business rules (CodeSystem/ValueSet canonical URLs,
    // caseSensitive, concept definitions, compose.include validation)
    const terminologyResourceIssues = composedTerminologyResourceValidator.validate(
      context.resource,
      context.fhirVersion,
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
  if (context.settings && isAspectEnabled(context.settings, 'custom_rule')) {
    const customRuleIssues = await customRuleExecutor.validate({
      resource: context.resource,
      structureDef: context.structureDef,
      organizationId: context.organizationId,
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

  return issues.map(issue => attachAppliedProfile(issue, context.profileUrl));
}

function attachAppliedProfile(issue: ValidationIssue, appliedProfile: string): ValidationIssue {
  if (issue.profile || !appliedProfile) return issue;
  return {
    ...issue,
    profile: appliedProfile,
    id: computeValidationIssueId({
      aspect: issue.aspect,
      severity: issue.severity,
      code: issue.code,
      path: issue.path,
      resourceType: issue.resourceType,
      message: issue.message,
      profile: appliedProfile,
      ruleId: issue.ruleId,
      details: issue.details,
    }),
  };
}

function isAspectEnabled(
  settings: ValidationOrchestratorContext['settings'],
  aspect: 'structural' | 'profile' | 'terminology' | 'reference' | 'invariant' | 'custom_rule' | 'metadata',
): boolean {
  return settings?.aspects?.[aspect]?.enabled !== false;
}
