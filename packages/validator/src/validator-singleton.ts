import type { RecordsValidator } from './core/validator-engine';
import type { FhirClientLike } from './core/profile-loader-utils';
import type { ValidationIssue, ValidationSettings } from './types';
import type { TerminologyResolutionConfig } from './validators/valueset-validator';
import type { AnomalyDetectorConfig, AnomalyFinding } from './validators/anomaly-detector';
import {
  toInternalFhirVersion,
  validateAllResources,
} from './public-validation-api';
import type {
  PublicBatchValidationOptions,
  PublicFhirVersion,
  PublicValidationInput,
  PublicValidationResult,
} from './public-validation-api';

let validatorInstance: RecordsValidator | null = null;
let validatorInstancePromise: Promise<RecordsValidator> | null = null;
type ScopedValidatorEntry = {
  promise: Promise<RecordsValidator>;
  instance?: RecordsValidator;
};
const scopedValidatorInstances = new Map<string, ScopedValidatorEntry>();
const MAX_SCOPED_VALIDATOR_INSTANCES = 32;

const defaultAllowedPackages = [
  'hl7.fhir.r4.core',
  'hl7.fhir.r4.examples',
  'de.gematik.*',
  'de.medizininformatikinitiative.*',
  'de.medizininformatik-initiative.*',
  'kbv.*',
  'de.basisprofil.*',
  'rki.demis.*',
  'hl7.eu.*',
  'hl7.fhir.us.*',
  'uk.nhsdigital.*',
  'fhir.r4.ukcore.*',
  'hl7.fhir.uk.*',
  'uk.core',
  'uk.core.r4.v2',
  'hl7.fhir.au.*',
  'nictiz.*',
  'iknl.*',
  'ihe.*',
  'hl7.fhir.uv.*',
] as const;

interface QuestionnaireItemLike {
  answerValueSet?: unknown;
  item?: unknown;
}

interface QuestionnaireLike {
  item?: unknown;
}

async function createRecordsValidator(): Promise<RecordsValidator> {
  const { RecordsValidator } = await import('./core/validator-engine');
  const { logger } = await import('./logger');
  const instance = new RecordsValidator({
      enableCaching: true,
      strictMode: false,
      timeout: 30000,
      allowedPackages: [...defaultAllowedPackages],
  });
  logger.info('[RecordsValidator] Validator initialized');
  return instance;
}

async function getRecordsValidator(runtimeScopeKey?: string): Promise<RecordsValidator> {
  if (!runtimeScopeKey) {
    validatorInstancePromise ??= createRecordsValidator().then((instance) => {
      validatorInstance = instance;
      return instance;
    });
    return validatorInstancePromise;
  }

  const existing = scopedValidatorInstances.get(runtimeScopeKey);
  if (existing) {
    scopedValidatorInstances.delete(runtimeScopeKey);
    scopedValidatorInstances.set(runtimeScopeKey, existing);
    return existing.promise;
  }

  const entry = {} as ScopedValidatorEntry;
  entry.promise = createRecordsValidator().then((instance) => {
    entry.instance = instance;
    return instance;
  });
  scopedValidatorInstances.set(runtimeScopeKey, entry);
  while (scopedValidatorInstances.size > MAX_SCOPED_VALIDATOR_INSTANCES) {
    const oldestKey = scopedValidatorInstances.keys().next().value;
    if (oldestKey === undefined) break;
    scopedValidatorInstances.delete(oldestKey);
  }
  return entry.promise;
}

async function prewarmAnswerValueSets(questionnaire: QuestionnaireLike): Promise<void> {
  const urls = new Set<string>();
  const walk = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const candidate = item as QuestionnaireItemLike;
      if (typeof candidate.answerValueSet === 'string') {
        urls.add(candidate.answerValueSet);
      }
      walk(candidate.item);
    }
  };
  walk(questionnaire.item);
  if (urls.size === 0) return;

  try {
    const { ValueSetPackageLoader } = await import('./validators/valueset-package-loader');
    const { valueSetCache } = await import('./validators/valueset-cache');
    const loader = new ValueSetPackageLoader(valueSetCache);
    for (const url of urls) {
      await loader.loadValueSet(url);
    }
  } catch {
    // Best-effort prewarm: failures degrade the display check to a cache miss.
  }
}

export interface RecordsValidatorSingleton {
  validate(
    resource: unknown,
    profileUrl?: string,
    fhirVersion?: PublicFhirVersion,
    settings?: ValidationSettings,
    fhirClient?: FhirClientLike,
    referenceResolver?: Parameters<RecordsValidator['validate']>[5],
    organizationId?: number,
    runtimeScopeKey?: string,
    serverId?: number,
  ): Promise<ValidationIssue[]>;
  validateMetadata(...args: Parameters<RecordsValidator['validateMetadata']>): ReturnType<RecordsValidator['validateMetadata']>;
  validateStructure(...args: Parameters<RecordsValidator['validateStructure']>): ReturnType<RecordsValidator['validateStructure']>;
  validateBatch(...args: Parameters<RecordsValidator['validateBatch']>): ReturnType<RecordsValidator['validateBatch']>;
  validateAll(inputs: PublicValidationInput[], options?: PublicBatchValidationOptions): Promise<PublicValidationResult[]>;
  isCreated(): boolean;
  isInitialized(): Promise<boolean>;
  isAvailable(): boolean;
  isProfileSupported(...args: Parameters<RecordsValidator['isProfileSupported']>): ReturnType<RecordsValidator['isProfileSupported']>;
  waitForInitialization(): ReturnType<RecordsValidator['waitForInitialization']>;
  getSdLoader(): Promise<ReturnType<RecordsValidator['getSdLoader']>>;
  loadProfileWithSnapshot(...args: Parameters<RecordsValidator['loadProfileWithSnapshot']>): ReturnType<RecordsValidator['loadProfileWithSnapshot']>;
  registerQuestionnaire(questionnaire: QuestionnaireLike): Promise<boolean>;
  getQuestionnaire(...args: Parameters<RecordsValidator['getQuestionnaire']>): ReturnType<RecordsValidator['getQuestionnaire']>;
  configureTerminologyResolution(config: TerminologyResolutionConfig): Promise<ReturnType<RecordsValidator['configureTerminologyResolution']>>;
  clearTerminologyCache(): Promise<ReturnType<RecordsValidator['clearTerminologyCache']>>;
  getConstraintDiagnostics(): Promise<ReturnType<RecordsValidator['getConstraintDiagnostics']>>;
  clearConstraintDiagnostics(): Promise<ReturnType<RecordsValidator['clearConstraintDiagnostics']>>;
  clearProfileCache(): Promise<ReturnType<RecordsValidator['clearProfileCache']> | undefined>;
  evictProfile(...args: Parameters<RecordsValidator['evictProfile']>): ReturnType<RecordsValidator['evictProfile']> | undefined;
  setPinnedCanonicals(...args: Parameters<RecordsValidator['setPinnedCanonicals']>): Promise<ReturnType<RecordsValidator['setPinnedCanonicals']>>;
  getPinnedCanonicalCount(): ReturnType<RecordsValidator['getPinnedCanonicalCount']>;
  detectAnomalies(resources: unknown[], config?: Partial<AnomalyDetectorConfig>): Promise<AnomalyFinding[]>;
}

export const recordsValidator: RecordsValidatorSingleton = {
  async validate(
    resource: unknown,
    profileUrl?: string,
    fhirVersion?: PublicFhirVersion,
    settings?: ValidationSettings,
    fhirClient?: FhirClientLike,
    referenceResolver?: Parameters<RecordsValidator['validate']>[5],
    organizationId?: number,
    runtimeScopeKey?: string,
    serverId?: number,
  ) {
    const instance = await getRecordsValidator(runtimeScopeKey);
    const mapped = fhirVersion ? toInternalFhirVersion(fhirVersion) : undefined;
    return instance.validate(
      resource,
      profileUrl,
      mapped,
      settings,
      fhirClient,
      referenceResolver,
      organizationId,
      serverId,
    );
  },
  async validateMetadata(...args) {
    const instance = await getRecordsValidator();
    return instance.validateMetadata(...args);
  },
  async validateStructure(...args) {
    const instance = await getRecordsValidator();
    return instance.validateStructure(...args);
  },
  async validateBatch(...args) {
    const instance = await getRecordsValidator(args[1]?.runtimeScopeKey);
    return instance.validateBatch(...args);
  },
  async validateAll(inputs, options) {
    const instance = await getRecordsValidator();
    return validateAllResources({
      validate: (resource, profileUrl, fhirVersion, settings, fhirClient) =>
        instance.validate(resource, profileUrl, fhirVersion, settings, fhirClient),
      validateBatch: (resources, batchOptions) =>
        instance.validateBatch(resources as any[], batchOptions),
    }, inputs, options);
  },
  isCreated() {
    return validatorInstance !== null;
  },
  async isInitialized() {
    return validatorInstance?.isAvailable() ?? false;
  },
  isAvailable() {
    return validatorInstance !== null;
  },
  async isProfileSupported(...args) {
    if (!validatorInstance) return false;
    return validatorInstance.isProfileSupported(...args);
  },
  async waitForInitialization() {
    const instance = await getRecordsValidator();
    return instance.waitForInitialization();
  },
  async getSdLoader() {
    const instance = await getRecordsValidator();
    await instance.waitForInitialization();
    return instance.getSdLoader();
  },
  async loadProfileWithSnapshot(profileUrl: string, fhirVersion: 'R4' | 'R5' | 'R6' = 'R4') {
    const instance = await getRecordsValidator();
    await instance.waitForInitialization();
    return instance.loadProfileWithSnapshot(profileUrl, fhirVersion);
  },
  async registerQuestionnaire(questionnaire) {
    const instance = await getRecordsValidator();
    await instance.waitForInitialization();
    const ok = instance.registerQuestionnaire(questionnaire);
    if (ok) await prewarmAnswerValueSets(questionnaire);
    return ok;
  },
  async getQuestionnaire(canonicalOrRef: string | undefined | null) {
    const instance = await getRecordsValidator();
    await instance.waitForInitialization();
    return instance.getQuestionnaire(canonicalOrRef);
  },
  async configureTerminologyResolution(config) {
    const instance = await getRecordsValidator();
    return instance.configureTerminologyResolution(config);
  },
  async clearTerminologyCache() {
    const instance = await getRecordsValidator();
    return instance.clearTerminologyCache();
  },
  async getConstraintDiagnostics() {
    const instance = await getRecordsValidator();
    return instance.getConstraintDiagnostics();
  },
  async clearConstraintDiagnostics() {
    const instance = await getRecordsValidator();
    return instance.clearConstraintDiagnostics();
  },
  async clearProfileCache() {
    validatorInstance?.clearProfileCache();
    await Promise.all([...scopedValidatorInstances.values()].map(async (entry) => {
      (await entry.promise).clearProfileCache();
    }));
  },
  evictProfile(profileUrl: string, fhirVersion: 'R4' | 'R5' | 'R6' = 'R4') {
    validatorInstance?.evictProfile(profileUrl, fhirVersion);
    for (const entry of scopedValidatorInstances.values()) {
      if (entry.instance) {
        entry.instance.evictProfile(profileUrl, fhirVersion);
      } else {
        void entry.promise.then(instance => instance.evictProfile(profileUrl, fhirVersion));
      }
    }
  },
  async setPinnedCanonicals(...args) {
    const instance = await getRecordsValidator();
    return instance.setPinnedCanonicals(...args);
  },
  getPinnedCanonicalCount(): number {
    return validatorInstance?.getPinnedCanonicalCount() ?? 0;
  },
  async detectAnomalies(resources, config) {
    const instance = await getRecordsValidator();
    return instance.detectAnomalies(resources, config);
  },
};

export async function ensureRecordsValidatorReady(): Promise<void> {
  const instance = await getRecordsValidator();
  await instance.waitForInitialization();
}

export async function getRecordsValidatorClass() {
  const { RecordsValidator } = await import('./core/validator-engine');
  return RecordsValidator;
}
