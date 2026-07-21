import type { ValidationIssue, ValidationSettings } from '../types';
import { BestPracticeValidator } from '../validators/best-practice-validator';
import {
  CustomRuleExecutor,
  InvariantExecutor,
  MetadataExecutor,
  ProfileExecutor,
  ReferenceExecutor,
  StructuralExecutor,
  TerminologyExecutor,
} from './executors';
import type { StructureDefinition } from './structure-definition-types';
import { runAllAspectValidations } from './validation-orchestrator';
import { aggregateRemoteCodeSystemBudgetIssues, dedupeIssues, suppressRedundantBindingWarnings } from './validation-utils';
import type { ReferenceResolver } from '../validators/slicing-validator';

export interface SingleResourceValidationInput {
  resource: any;
  profileUrl: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  structureDef: StructureDefinition;
  strictMode: boolean;
  settings?: ValidationSettings;
  profileFallbackIssue?: ValidationIssue | null;
  contextQuestionnaire?: any;
  referenceResolver?: ReferenceResolver | null;
  organizationId?: number;
}

export interface SingleResourceValidationDeps {
  structuralExecutor: StructuralExecutor;
  profileExecutor: ProfileExecutor;
  terminologyExecutor: TerminologyExecutor;
  invariantExecutor: InvariantExecutor;
  customRuleExecutor: CustomRuleExecutor;
  metadataExecutor: MetadataExecutor;
  referenceExecutor: ReferenceExecutor;
  bestPracticeValidator: BestPracticeValidator;
  validateBundleEntriesIfNeeded(resource: any, fhirVersion: 'R4' | 'R5' | 'R6'): Promise<ValidationIssue[]>;
}

export async function collectSingleResourceValidationIssues(
  input: SingleResourceValidationInput,
  deps: SingleResourceValidationDeps,
): Promise<ValidationIssue[]> {
  const aspectIssues = await runAllAspectValidations(
    {
      resource: input.resource,
      resourceType: input.resource.resourceType,
      profileUrl: input.profileUrl,
      fhirVersion: input.fhirVersion,
      structureDef: input.structureDef,
      strictMode: input.strictMode,
      settings: input.settings,
      contextQuestionnaire: input.contextQuestionnaire,
      referenceResolver: input.referenceResolver,
      organizationId: input.organizationId,
    },
    deps.structuralExecutor,
    deps.profileExecutor,
    deps.terminologyExecutor,
    deps.invariantExecutor,
    deps.customRuleExecutor,
    deps.metadataExecutor,
    deps.referenceExecutor,
  );

  const bestPracticeIssues = shouldValidateBestPractices(input.settings)
    ? deps.bestPracticeValidator.validate({
      resource: input.resource,
      resourceType: input.resource.resourceType,
      profileUrl: input.profileUrl,
    })
    : [];

  const bundleEntryIssues = shouldValidateBundleEntryResources(input.settings)
    ? await deps.validateBundleEntriesIfNeeded(input.resource, input.fhirVersion)
    : [];

  return aggregateRemoteCodeSystemBudgetIssues(suppressRedundantBindingWarnings(dedupeIssues([
    ...(input.profileFallbackIssue ? [input.profileFallbackIssue] : []),
    ...aspectIssues,
    ...bestPracticeIssues,
    ...bundleEntryIssues,
  ])));
}

export function shouldValidateBundleEntryResources(settings?: ValidationSettings): boolean {
  return settings?.recursiveReferenceValidation?.validateBundleEntries !== false;
}

export function shouldValidateBestPractices(settings?: ValidationSettings): boolean {
  return settings?.enableBestPracticeChecks !== false;
}
