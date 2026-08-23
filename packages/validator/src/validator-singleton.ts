import { RecordsValidator } from './core/validator-engine';
import type { FhirClientLike } from './core/profile-loader-utils';
import type { ValidationIssue, ValidationSettings } from './types';
import {
  toInternalFhirVersion,
  validateAllResources,
} from './public-validation-api';
import type { PublicFhirVersion } from './public-validation-api';
import { logger } from './logger';
import { emptyFHIRPathCacheStats } from './validators/fhirpath-cache-diagnostics';
import { ValidatorRuntimeRegistry } from './validator-runtime-registry';
import type {
  RecordsValidationRequest,
  RecordsValidatorRuntimeLease,
  RecordsValidatorSingleton,
} from './validator-singleton-types';
export type {
  RecordsValidationRequest,
  RecordsValidatorAdministration,
  RecordsValidatorInspection,
  RecordsValidatorRuntimeLease,
  RecordsValidatorSingleton,
  RecordsValidatorValidation,
} from './validator-singleton-types';

const MAX_SCOPED_VALIDATOR_INSTANCES = 8;
const DEFAULT_SCOPED_PROFILE_CACHE_MAX_ENTRIES = 192;
const MAX_SCOPED_PROFILE_CACHE_MAX_ENTRIES = 4_096;

const defaultAllowedPackages = [
  'hl7.fhir.r4.core',
  'hl7.fhir.r4.examples',
  'de.gematik.*',
  'de.medizininformatikinitiative.*',
  'de.medizininformatik-initiative.*',
  'de.einwilligungsmanagement',
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

async function createRecordsValidator(scoped = false): Promise<RecordsValidator> {
  const instance = new RecordsValidator({
    enableCaching: true,
    strictMode: false,
    timeout: 30000,
    allowedPackages: [...defaultAllowedPackages],
    profileCacheMaxEntries: scoped ? resolveScopedProfileCacheMaxEntries() : undefined,
    prewarmProfileSource: !scoped,
  });
  logger.info('[RecordsValidator] Validator initialized');
  return instance;
}

const runtimeRegistry = new ValidatorRuntimeRegistry(
  createRecordsValidator,
  MAX_SCOPED_VALIDATOR_INSTANCES,
);

async function getRecordsValidator(runtimeScopeKey?: string): Promise<RecordsValidator> {
  return runtimeRegistry.get(runtimeScopeKey);
}

export function acquireRecordsValidatorRuntime(
  runtimeScopeKey?: string,
): RecordsValidatorRuntimeLease {
  const lease = runtimeRegistry.acquire(runtimeScopeKey);
  let released = false;

  return {
    async ready() {
      const instance = await lease.promise;
      await instance.waitForInitialization();
    },
    async loadProfileWithSnapshot(profileUrl, fhirVersion = 'R4') {
      const instance = await lease.promise;
      await instance.waitForInitialization();
      return instance.loadProfileWithSnapshot(
        profileUrl,
        toInternalFhirVersion(fhirVersion),
      );
    },
    async resetProfileWarmupState() {
      const instance = await lease.promise;
      instance.resetProfileWarmupState();
    },
    release() {
      if (released) return;
      released = true;
      lease.release();
    },
  };
}

async function validateRecordsRequest(
  request: RecordsValidationRequest,
): Promise<ValidationIssue[]> {
  const instance = await getRecordsValidator(request.runtimeScopeKey);
  const mapped = request.fhirVersion
    ? toInternalFhirVersion(request.fhirVersion)
    : undefined;
  return instance.validate(
    request.resource,
    request.profileUrl,
    mapped,
    request.settings,
    request.fhirClient,
    request.referenceResolver,
    request.organizationId,
    request.serverId,
  );
}

export const recordsValidator: RecordsValidatorSingleton = {
  validateRequest: validateRecordsRequest,
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
    return validateRecordsRequest({
      resource,
      profileUrl,
      fhirVersion,
      settings,
      fhirClient,
      referenceResolver,
      organizationId,
      runtimeScopeKey,
      serverId,
    });
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
  async validateAspects(...args) {
    const instance = await getRecordsValidator(args[1]?.runtimeScopeKey);
    return instance.validateAspects(...args);
  },
  async validateAll(inputs, options) {
    const instance = await getRecordsValidator();
    return validateAllResources({
      validate: (resource, profileUrl, fhirVersion, settings, fhirClient) =>
        instance.validate(resource, profileUrl, fhirVersion, settings, fhirClient),
      validateBatch: (resources, batchOptions) =>
        instance.validateBatch(resources, batchOptions),
    }, inputs, options);
  },
  isCreated() {
    return runtimeRegistry.peekDefault() !== null;
  },
  async isInitialized() {
    return runtimeRegistry.peekDefault()?.isAvailable() ?? false;
  },
  isAvailable() {
    return runtimeRegistry.peekDefault() !== null;
  },
  async isProfileSupported(...args) {
    const instance = runtimeRegistry.peekDefault();
    if (!instance) return false;
    return instance.isProfileSupported(...args);
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
    if (ok) await instance.prewarmQuestionnaireAnswerValueSets(questionnaire);
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
  async registerTerminologyResource(...args) {
    const instance = await getRecordsValidator();
    return instance.registerTerminologyResource(...args);
  },
  async getConstraintDiagnostics() {
    const instance = await getRecordsValidator();
    return instance.getConstraintDiagnostics();
  },
  getFHIRPathCacheStats() {
    return runtimeRegistry.peekDefault()?.getFHIRPathCacheStats() ?? emptyFHIRPathCacheStats();
  },
  async clearConstraintDiagnostics() {
    const instance = await getRecordsValidator();
    return instance.clearConstraintDiagnostics();
  },
  async clearFHIRPathCaches() {
    await Promise.all(runtimeRegistry.currentPromises().map(async pending => {
      (await pending).clearFHIRPathCaches();
    }));
  },
  async clearProfileCache() {
    await Promise.all(runtimeRegistry.currentPromises().map(async pending => {
      (await pending).clearProfileCache();
    }));
  },
  async resetProfileWarmupState() {
    await Promise.all(runtimeRegistry.currentPromises().map(async pending => {
      (await pending).resetProfileWarmupState();
    }));
  },
  evictProfile(profileUrl: string, fhirVersion: 'R4' | 'R5' | 'R6' = 'R4') {
    runtimeRegistry.peekDefault()?.evictProfile(profileUrl, fhirVersion);
    for (const entry of runtimeRegistry.currentScopedEntries()) {
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
    return runtimeRegistry.peekDefault()?.getPinnedCanonicalCount() ?? 0;
  },
  getPinnedCanonicalFingerprint() {
    return runtimeRegistry.peekDefault()?.getPinnedCanonicalFingerprint() ?? {
      algorithm: 'sha256-sorted-canonical-v1',
      count: 0,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
  },
  async detectAnomalies(resources, config) {
    const instance = await getRecordsValidator();
    return instance.detectAnomalies(resources, config);
  },
};

export function getCombinedFHIRPathCacheStats() {
  return recordsValidator.getFHIRPathCacheStats();
}

export async function ensureRecordsValidatorReady(): Promise<void> {
  const instance = await getRecordsValidator();
  await instance.waitForInitialization();
}

export async function getRecordsValidatorClass() {
  return RecordsValidator;
}

export function resolveScopedProfileCacheMaxEntries(): number {
  const parsed = Number.parseInt(
    process.env.VALIDATION_SCOPED_PROFILE_CACHE_MAX_ENTRIES ?? '',
    10,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_SCOPED_PROFILE_CACHE_MAX_ENTRIES)
    : DEFAULT_SCOPED_PROFILE_CACHE_MAX_ENTRIES;
}
