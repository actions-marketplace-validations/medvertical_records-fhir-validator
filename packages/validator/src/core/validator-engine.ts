import type { ValidationIssue, ValidationSettings } from '../types';
import { StructureDefinitionLoader } from './structure-definition-loader';
import type { StructureDefinition } from './structure-definition-types';

import { ValueSetValidator, type TerminologyResolutionConfig } from '../validators/valueset-validator';
import { logger } from '../logger';
import {
  StructuralExecutor,
  ProfileExecutor,
  TerminologyExecutor,
  ReferenceExecutor,
  InvariantExecutor,
  CustomRuleExecutor,
  MetadataExecutor
} from './executors';
import { createValidationErrorIssue } from './validation-utils';
import { loadProfileWithSnapshot, type FhirClientLike } from './profile-loader-utils';
import type { BatchValidationOptions } from './batch-validator';
import { AnomalyDetector, type AnomalyFinding, type AnomalyDetectorConfig } from '../validators/anomaly-detector';
import {
  applyProfileLoadingSettings,
  buildTerminologyResolutionConfig,
} from './validator-runtime-settings';
import { validateBundleEntryResources } from './validator-bundle-entry-validation';
import { QuestionnaireContextRegistry } from './questionnaire-context-registry';
import { resolveRecordsValidatorConfig, type RecordsValidatorConfig } from './validator-engine-config';
import {
  createRecordsValidatorComponents,
  type RecordsValidatorComponents,
} from './validator-engine-components';
import { validateResourceStructure } from './validator-structure-validation';
import { validateRecordsBatch } from './validator-batch-validation';
import { validateRecordsResource } from './validator-single-resource-validation';
import { checkRecordsValidatorAvailability } from './validator-initialization';
import type { ReferenceResolver } from '../validators/slicing-validator';

export type { RecordsValidatorConfig } from './validator-engine-config';

export interface ValidationContext {
  resource: any;
  resourceType: string;
  profileUrl?: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  strictMode: boolean;
}

export class RecordsValidator {
  private config: RecordsValidatorConfig;
  private profileCache!: RecordsValidatorComponents['profileCache'];
  private sdLoader!: StructureDefinitionLoader;
  private valuesetValidator!: ValueSetValidator;
  private constraintValidator!: RecordsValidatorComponents['constraintValidator'];
  private snapshotGenerator!: RecordsValidatorComponents['snapshotGenerator'];
  private available: boolean = false;
  private initializationPromise: Promise<void>;

  private structuralExecutor!: StructuralExecutor;
  private profileExecutor!: ProfileExecutor;
  private terminologyExecutor!: TerminologyExecutor;
  private referenceExecutor!: ReferenceExecutor;
  private invariantExecutor!: InvariantExecutor;
  private customRuleExecutor!: CustomRuleExecutor;
  private metadataExecutor!: MetadataExecutor;
  private bestPracticeValidator!: RecordsValidatorComponents['bestPracticeValidator'];
  private anomalyDetector!: AnomalyDetector;
  private questionnaireRegistry!: QuestionnaireContextRegistry;

  constructor(config: RecordsValidatorConfig = {}) {
    this.config = resolveRecordsValidatorConfig(config);

    const components = createRecordsValidatorComponents(this.config);
    Object.assign(this, components);

    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.available = await checkRecordsValidatorAvailability(this.sdLoader);
  }

  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async validateBatch(
    resources: any[],
    options: BatchValidationOptions = {}
  ): Promise<Map<any, ValidationIssue[]> | Map<any, any>> {
    await this.waitForInitialization();
    this.applyRuntimeSettings(options.settings as ValidationSettings | undefined);

    return validateRecordsBatch(resources, options, {
      sdLoader: this.sdLoader,
      profileCache: this.profileCache,
      snapshotGenerator: this.snapshotGenerator,
      structuralExecutor: this.structuralExecutor,
      profileExecutor: this.profileExecutor,
      terminologyExecutor: this.terminologyExecutor,
      referenceExecutor: this.referenceExecutor,
      invariantExecutor: this.invariantExecutor,
      customRuleExecutor: this.customRuleExecutor,
      metadataExecutor: this.metadataExecutor,
      bestPracticeValidator: this.bestPracticeValidator,
      strictMode: this.config.strictMode || false,
      validateSingleResource: (resource, profileUrl, fhirVersion, settings, fhirClient, organizationId, serverId) =>
        this.validate(resource, profileUrl, fhirVersion, settings, fhirClient, undefined, organizationId, serverId),
    });
  }

  async validate(
    resource: any,
    profileUrl?: string,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
    settings?: ValidationSettings,
    fhirClient?: FhirClientLike,
    referenceResolver?: ReferenceResolver | null,
    organizationId?: number,
    serverId?: number,
  ): Promise<ValidationIssue[]> {
    await this.waitForInitialization();
    this.applyRuntimeSettings(settings as ValidationSettings | undefined);

    return validateRecordsResource(
      { resource, profileUrl, fhirVersion, settings, fhirClient, referenceResolver, organizationId, serverId },
      {
        sdLoader: this.sdLoader,
        profileCache: this.profileCache,
        snapshotGenerator: this.snapshotGenerator,
        structuralExecutor: this.structuralExecutor,
        profileExecutor: this.profileExecutor,
        terminologyExecutor: this.terminologyExecutor,
        invariantExecutor: this.invariantExecutor,
        customRuleExecutor: this.customRuleExecutor,
        metadataExecutor: this.metadataExecutor,
        referenceExecutor: this.referenceExecutor,
        bestPracticeValidator: this.bestPracticeValidator,
        questionnaireRegistry: this.questionnaireRegistry,
        strictMode: this.config.strictMode || false,
        validateBundleEntriesIfNeeded: (target, version) =>
          this.validateBundleEntriesIfNeeded(target, version),
      },
    );
  }

  private async validateBundleEntriesIfNeeded(
    resource: any,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<ValidationIssue[]> {
    if (resource.resourceType !== 'Bundle' || !Array.isArray(resource.entry)) {
      return [];
    }
    return this.validateBundleEntries(resource, fhirVersion, 1);
  }

  private static readonly BUNDLE_ENTRY_MAX_DEPTH = 3;

  async validateStructure(
    resource: any,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
    recursionDepth: number = 0
  ): Promise<ValidationIssue[]> {
    // Ensure initialization is complete before validating
    await this.waitForInitialization();

    return validateResourceStructure(resource, fhirVersion, recursionDepth, {
      sdLoader: this.sdLoader,
      profileCache: this.profileCache,
      snapshotGenerator: this.snapshotGenerator,
      structuralExecutor: this.structuralExecutor,
      questionnaireRegistry: this.questionnaireRegistry,
      maxBundleEntryDepth: RecordsValidator.BUNDLE_ENTRY_MAX_DEPTH,
      validateBundleEntries: (bundle, version, nextDepth) =>
        this.validateBundleEntries(bundle, version, nextDepth),
    });
  }

  private async validateBundleEntries(
    bundle: any,
    fhirVersion: 'R4' | 'R5' | 'R6',
    recursionDepth: number
  ): Promise<ValidationIssue[]> {
    return validateBundleEntryResources(bundle, fhirVersion, recursionDepth, {
      sdLoader: this.sdLoader,
      profileCache: this.profileCache,
      snapshotGenerator: this.snapshotGenerator,
      maxDepth: RecordsValidator.BUNDLE_ENTRY_MAX_DEPTH,
      structuralExecutor: this.structuralExecutor,
      validateResource: (resource, profileUrl, version) => this.validate(resource, profileUrl, version),
      validateNestedBundleEntries: (nestedBundle, version, nextDepth) =>
        this.validateBundleEntries(nestedBundle, version, nextDepth),
    });
  }

  async validateMetadata(
    resource: any
  ): Promise<ValidationIssue[]> {
    // Ensure initialization is complete before validating
    await this.waitForInitialization();

    try {
      return await this.metadataExecutor.validate({ resource });
    } catch (error) {
      logger.error('[RecordsValidator] Metadata validation error:', error);
      return [createValidationErrorIssue(
        'metadata',
        'validation-error',
        `Metadata validation failed: ${error instanceof Error ? error.message : String(error)}`
      )];
    }
  }

  async validateReferences(
    resource: any,
    fhirClient?: FhirClientLike,
    fhirVersion?: 'R4' | 'R5' | 'R6'
  ): Promise<ValidationIssue[]> {
    try {
      return await this.referenceExecutor.validate({
        resource,
        fhirClient,
        fhirVersion
      });
    } catch (error) {
      logger.error('[RecordsValidator] Reference validation error:', error);
      return [createValidationErrorIssue(
        'reference',
        'validation-error',
        `Reference validation failed: ${error instanceof Error ? error.message : String(error)}`
      )];
    }
  }

  async isProfileSupported(
    profileUrl: string,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
  ): Promise<boolean> {
    await this.waitForInitialization();
    return (await this.loadProfileWithSnapshot(profileUrl, fhirVersion)) !== null;
  }

  getSupportedProfiles(): string[] {
    return this.sdLoader.getAvailableProfiles();
  }

  getSdLoader(): StructureDefinitionLoader {
    return this.sdLoader;
  }

  async loadProfileWithSnapshot(
    profileUrl: string,
    fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
  ): Promise<StructureDefinition | null> {
    return loadProfileWithSnapshot(
      this.sdLoader,
      this.profileCache,
      this.snapshotGenerator,
      profileUrl,
      fhirVersion,
    );
  }

  registerQuestionnaire(questionnaire: any): boolean {
    return this.questionnaireRegistry.register(questionnaire);
  }

  getQuestionnaire(canonicalOrRef: string | undefined | null): any | null {
    return this.questionnaireRegistry.get(canonicalOrRef);
  }

  private applyRuntimeSettings(settings?: ValidationSettings): void {
    if (!settings) {
      return;
    }

    applyProfileLoadingSettings(this.sdLoader, settings);
    this.configureTerminologyResolution(buildTerminologyResolutionConfig(settings));
  }

  configureTerminologyResolution(config: TerminologyResolutionConfig): void {
    this.terminologyExecutor.configureResolution(config);
    this.structuralExecutor.configureTerminologyResolution(config);
    this.valuesetValidator.setResolutionConfig(config);
    const scopedCount = config.servers?.filter(s => s.preferredSystems && s.preferredSystems.length > 0).length || 0;
    logger.info(
      `[RecordsValidator] Terminology resolution configured: strategy=${config.strategy}, ` +
      `server=${config.serverUrl}, auth=${config.auth?.type || 'none'}, ` +
      `servers=${config.servers?.length || 0} (${scopedCount} with scope routing)`,
    );
  }

  clearTerminologyCache(): void {
    this.terminologyExecutor.clearCache();
    this.valuesetValidator.clearCache();
    logger.info('[RecordsValidator] Terminology caches cleared');
  }

  getConstraintDiagnostics(): ReturnType<RecordsValidatorComponents['constraintValidator']['getDiagnostics']> {
    return this.constraintValidator.getDiagnostics();
  }

  clearConstraintDiagnostics(): void {
    this.constraintValidator.clearDiagnostics();
  }

  clearProfileCache(): void {
    this.profileCache.clear();
    logger.info('[RecordsValidator] Profile cache cleared');
  }

  evictProfile(profileUrl: string, fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'): void {
    this.snapshotGenerator.evict(profileUrl);
    this.profileCache.delete(`${profileUrl}:${fhirVersion}:snapshot`);
  }

  setPinnedCanonicals(pinned: Map<string, string>): void {
    this.sdLoader.setPinnedCanonicals(pinned);
  }

  getPinnedCanonicalCount(): number {
    return this.sdLoader.getPinnedCanonicalCount();
  }

  detectAnomalies(
    resources: any[],
    config?: Partial<AnomalyDetectorConfig>,
  ): AnomalyFinding[] {
    if (config) {
      return new AnomalyDetector(config).detect(resources);
    }
    return this.anomalyDetector.detect(resources);
  }
}
