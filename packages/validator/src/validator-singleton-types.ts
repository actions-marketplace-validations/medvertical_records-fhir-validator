import type { RecordsValidator } from './core/validator-engine';
import type { FhirClientLike } from './core/profile-loader-utils';
import type {
  PublicBatchValidationOptions,
  PublicFhirVersion,
  PublicValidationInput,
  PublicValidationRequest,
  PublicValidationResult,
} from './public-validation-api';
import type { ValidationIssue, ValidationSettings } from './types';
import type { AnomalyDetectorConfig, AnomalyFinding } from './validators/anomaly-detector';
import type { TerminologyResolutionConfig } from './validators/valueset-validator';

export interface RecordsValidatorRuntimeLease {
  ready(): Promise<void>;
  loadProfileWithSnapshot(
    profileUrl: string,
    fhirVersion?: PublicFhirVersion,
  ): ReturnType<RecordsValidator['loadProfileWithSnapshot']>;
  resetProfileWarmupState(): Promise<void>;
  release(): void;
}

export interface RecordsValidationRequest extends PublicValidationRequest {
  referenceResolver?: Parameters<RecordsValidator['validate']>[5];
  organizationId?: number;
  runtimeScopeKey?: string;
  serverId?: number;
}

export interface RecordsValidatorValidation {
  validateRequest(request: RecordsValidationRequest): Promise<ValidationIssue[]>;
  /** @deprecated Use validateRequest() so optional values cannot be shifted accidentally. */
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
  validateAspects(...args: Parameters<RecordsValidator['validateAspects']>): ReturnType<RecordsValidator['validateAspects']>;
  validateAll(inputs: PublicValidationInput[], options?: PublicBatchValidationOptions): Promise<PublicValidationResult[]>;
  detectAnomalies(resources: unknown[], config?: Partial<AnomalyDetectorConfig>): Promise<AnomalyFinding[]>;
}

export interface RecordsValidatorInspection {
  isCreated(): boolean;
  isInitialized(): Promise<boolean>;
  isAvailable(): boolean;
  isProfileSupported(...args: Parameters<RecordsValidator['isProfileSupported']>): ReturnType<RecordsValidator['isProfileSupported']>;
  waitForInitialization(): ReturnType<RecordsValidator['waitForInitialization']>;
  getSdLoader(): Promise<ReturnType<RecordsValidator['getSdLoader']>>;
  loadProfileWithSnapshot(...args: Parameters<RecordsValidator['loadProfileWithSnapshot']>): ReturnType<RecordsValidator['loadProfileWithSnapshot']>;
  registerQuestionnaire(questionnaire: { item?: unknown }): Promise<boolean>;
  getQuestionnaire(...args: Parameters<RecordsValidator['getQuestionnaire']>): Promise<ReturnType<RecordsValidator['getQuestionnaire']>>;
  getConstraintDiagnostics(): Promise<ReturnType<RecordsValidator['getConstraintDiagnostics']>>;
  getFHIRPathCacheStats(): ReturnType<RecordsValidator['getFHIRPathCacheStats']>;
  getPinnedCanonicalCount(): ReturnType<RecordsValidator['getPinnedCanonicalCount']>;
  getPinnedCanonicalFingerprint(): ReturnType<RecordsValidator['getPinnedCanonicalFingerprint']>;
}

export interface RecordsValidatorAdministration {
  configureTerminologyResolution(config: TerminologyResolutionConfig): Promise<ReturnType<RecordsValidator['configureTerminologyResolution']>>;
  clearTerminologyCache(): Promise<ReturnType<RecordsValidator['clearTerminologyCache']>>;
  registerTerminologyResource(...args: Parameters<RecordsValidator['registerTerminologyResource']>): Promise<ReturnType<RecordsValidator['registerTerminologyResource']>>;
  clearConstraintDiagnostics(): Promise<ReturnType<RecordsValidator['clearConstraintDiagnostics']>>;
  clearFHIRPathCaches(): Promise<void>;
  clearProfileCache(): Promise<ReturnType<RecordsValidator['clearProfileCache']> | undefined>;
  resetProfileWarmupState(): Promise<void>;
  evictProfile(...args: Parameters<RecordsValidator['evictProfile']>): ReturnType<RecordsValidator['evictProfile']> | undefined;
  setPinnedCanonicals(...args: Parameters<RecordsValidator['setPinnedCanonicals']>): Promise<ReturnType<RecordsValidator['setPinnedCanonicals']>>;
}

export interface RecordsValidatorSingleton
  extends RecordsValidatorValidation, RecordsValidatorInspection, RecordsValidatorAdministration {}
