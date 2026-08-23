import type { ValidationIssue, ValidationSettings } from '../types';
import type { ProfileCache } from '../cache/profile-cache';
import type { BestPracticeValidator } from '../validators/best-practice-validator';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { SnapshotGenerator } from './snapshot-generator';
import type { FhirClientLike } from './profile-loader-utils';
import type {
  CustomRuleExecutor,
  InvariantExecutor,
  MetadataExecutor,
  ProfileExecutor,
  ReferenceExecutor,
  StructuralExecutor,
  TerminologyExecutor,
} from './executors';
import { logger } from '../logger';
import {
  BatchValidationAbortedError,
  executeBatchValidation,
  type BatchValidationOptions,
} from './batch-validator';
import { buildMultiAspectValidateCallback } from './multi-aspect-validate-callback';
import type { MultiAspectValidateResult } from './multi-aspect-types';
import type { QuestionnaireContextRegistry } from './questionnaire-context-registry';
import type { SDFHIRPathExecutor } from '../validators/sd-fhirpath-executor';
import type { TerminologyResourceValidator } from '../validators/terminology-resource-validator';
import type { ProfileWarmupCoordinator } from './profile-warmup-coordinator';
import { groupResourcesByProfile } from './batch-resource-planning';
import type { ProfileSourceContext } from '../persistence';
import type { RecordsValidatorComponents } from './validator-engine-components';
import { isRecord } from './fhir-resource';

export interface RecordsBatchValidationContext {
  sdLoader: StructureDefinitionLoader;
  profileCache: ProfileCache;
  snapshotGenerator: SnapshotGenerator;
  profileWarmupCoordinator: ProfileWarmupCoordinator;
  structuralExecutor: StructuralExecutor;
  profileExecutor: ProfileExecutor;
  terminologyExecutor: TerminologyExecutor;
  referenceExecutor: ReferenceExecutor;
  invariantExecutor: InvariantExecutor;
  customRuleExecutor: CustomRuleExecutor;
  metadataExecutor: MetadataExecutor;
  bestPracticeValidator: BestPracticeValidator;
  questionnaireRegistry: QuestionnaireContextRegistry;
  sdFHIRPathExecutor: SDFHIRPathExecutor;
  terminologyResourceValidator: TerminologyResourceValidator;
  strictMode: boolean;
  validateSingleResource: (
    resource: unknown,
    profileUrl: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
    settings?: ValidationSettings,
    fhirClient?: FhirClientLike,
    organizationId?: number,
    serverId?: number,
  ) => Promise<ValidationIssue[]>;
}

export function createRecordsBatchValidationContext(options: {
  components: RecordsValidatorComponents;
  profileWarmupCoordinator: ProfileWarmupCoordinator;
  strictMode: boolean;
  validateSingleResource: RecordsBatchValidationContext['validateSingleResource'];
}): RecordsBatchValidationContext {
  const components = options.components;
  return {
    sdLoader: components.sdLoader,
    profileCache: components.profileCache,
    snapshotGenerator: components.snapshotGenerator,
    profileWarmupCoordinator: options.profileWarmupCoordinator,
    structuralExecutor: components.structuralExecutor,
    profileExecutor: components.profileExecutor,
    terminologyExecutor: components.terminologyExecutor,
    referenceExecutor: components.referenceExecutor,
    invariantExecutor: components.invariantExecutor,
    customRuleExecutor: components.customRuleExecutor,
    metadataExecutor: components.metadataExecutor,
    bestPracticeValidator: components.bestPracticeValidator,
    questionnaireRegistry: components.questionnaireRegistry,
    sdFHIRPathExecutor: components.sdFHIRPathExecutor,
    terminologyResourceValidator: components.terminologyResourceValidator,
    strictMode: options.strictMode,
    validateSingleResource: options.validateSingleResource,
  };
}

export async function validateRecordsBatch(
  resources: unknown[],
  options: BatchValidationOptions,
  context: RecordsBatchValidationContext,
): Promise<Map<unknown, ValidationIssue[]> | Map<unknown, MultiAspectValidateResult>> {
  if (options.aspects && options.aspects.length > 0 && options.settings) {
    logger.info(`[RecordsValidator] ⚡ Starting MULTI-ASPECT batch validation for ${resources.length} resources`);
    logger.info(`[RecordsValidator] 📋 Aspects: ${options.aspects.join(', ')}`);

    return executeBatchValidation<MultiAspectValidateResult>(resources, options, {
      sdLoader: context.sdLoader,
      profileCache: context.profileCache,
      snapshotGenerator: context.snapshotGenerator,
      profileWarmupCoordinator: context.profileWarmupCoordinator,
      validateResource: buildMultiAspectValidateCallback(
        {
          sdLoader: context.sdLoader,
          snapshotGenerator: context.snapshotGenerator,
          profileCache: context.profileCache,
          fhirClient: options.fhirClient,
          structuralExecutor: context.structuralExecutor,
          profileExecutor: context.profileExecutor,
          terminologyExecutor: context.terminologyExecutor,
          referenceExecutor: context.referenceExecutor,
          invariantExecutor: context.invariantExecutor,
          customRuleExecutor: context.customRuleExecutor,
          metadataExecutor: context.metadataExecutor,
          bestPracticeValidator: context.bestPracticeValidator,
          questionnaireRegistry: context.questionnaireRegistry,
          sdFHIRPathExecutor: context.sdFHIRPathExecutor,
          terminologyResourceValidator: context.terminologyResourceValidator,
          strictMode: context.strictMode,
        },
        options.aspects,
        options.settings,
        options.organizationId,
        options.shouldStop,
        options.onEmbeddedResourceValidated,
        options.referenceResolver,
        options.serverId,
      ),
    });
  }

  return executeBatchValidation(resources, options, {
    sdLoader: context.sdLoader,
    profileCache: context.profileCache,
    snapshotGenerator: context.snapshotGenerator,
    profileWarmupCoordinator: context.profileWarmupCoordinator,
    validateResource: (resource, profileUrl, fhirVersion) => context.validateSingleResource(
      resource,
      profileUrl,
      fhirVersion,
      options.settings,
      options.fhirClient,
      options.organizationId,
      options.serverId,
    ),
  });
}

export async function validateRecordsAspects(
  resource: unknown,
  options: BatchValidationOptions,
  context: RecordsBatchValidationContext,
): Promise<MultiAspectValidateResult> {
  if (!options.aspects?.length || !options.settings) {
    throw new Error('Direct aspect validation requires aspects and settings');
  }
  if (options.shouldStop?.()) throw new BatchValidationAbortedError();
  const fhirVersion = options.fhirVersion ?? 'R4';
  const profileSourceContext: ProfileSourceContext = {
    organizationId: options.organizationId,
    serverId: options.serverId,
    fhirVersion,
  };
  context.sdLoader.setProfileResolutionContext(
    profileSourceContext,
    options.settings,
  );
  const profileUrl = groupResourcesByProfile(
    [resource],
    options.profileUrl,
  ).keys().next().value;
  if (!profileUrl) throw new Error('Resource profile could not be resolved');
  const validate = buildMultiAspectValidateCallback(
    {
      sdLoader: context.sdLoader,
      snapshotGenerator: context.snapshotGenerator,
      profileCache: context.profileCache,
      fhirClient: options.fhirClient,
      structuralExecutor: context.structuralExecutor,
      profileExecutor: context.profileExecutor,
      terminologyExecutor: context.terminologyExecutor,
      referenceExecutor: context.referenceExecutor,
      invariantExecutor: context.invariantExecutor,
      customRuleExecutor: context.customRuleExecutor,
      metadataExecutor: context.metadataExecutor,
      bestPracticeValidator: context.bestPracticeValidator,
      questionnaireRegistry: context.questionnaireRegistry,
      sdFHIRPathExecutor: context.sdFHIRPathExecutor,
      terminologyResourceValidator: context.terminologyResourceValidator,
      strictMode: context.strictMode,
    },
    options.aspects,
    options.settings,
    options.organizationId,
    options.shouldStop,
    options.onEmbeddedResourceValidated,
    options.referenceResolver,
    options.serverId,
  );
  const execute = () => validate(resource, profileUrl, fhirVersion);
  const result = options.scheduleValidation
    ? await options.scheduleValidation(execute)
    : await execute();
  if (options.shouldStop?.()) throw new BatchValidationAbortedError();
  if (options.onResourceValidated && isRecord(resource)) {
    await options.onResourceValidated(resource, result);
  }
  return result;
}
