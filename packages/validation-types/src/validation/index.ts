export type {
  ValidationAspect,
  ValidationSeverity,
  ValidationStrictness,
  ValidationStatus,
  ValidationAction,
  StructuralValidationEngine,
  ProfileValidationEngine,
  TerminologyValidationEngine,
  ReferenceValidationEngine,
  InvariantValidationEngine,
  CustomRuleValidationEngine,
  MetadataValidationEngine,
  ServerStatus,
  FHIRVersion
} from './enums';

export type { ValidationAspectType } from './aspect-enums';
export {
  FindingSource,
  type FindingAspectType,
  type FindingSourceSeverityCounts,
  type FindingSourceSummary,
  type FindingSourceType,
} from './finding-source';

export {
  DEFAULT_VALIDATION_STRICTNESS,
  VALIDATION_ASPECTS,
  VALIDATION_ASPECT_LABELS,
  VALIDATION_ASPECT_DESCRIPTIONS,
  isErrorValidationSeverity,
  isInformationValidationSeverity,
} from './enums';

export {
  CANONICAL_CUSTOM_RULE_ASPECT,
  normalizeValidationAspect,
  normalizeValidationAspects,
  normalizeValidationSettings
} from './aspect-aliases';

export type {
  ValidationIssue,
  ValidationIssueTarget,
  ValidationError,
  ValidationRetryInfo,
  ValidationRetryAttempt
} from './messages';

export { calculateValidationIssueScore } from './scoring';
export type {
  ValidationResult,
  ValidationAspectResult,
  EnhancedValidationSummary,
  ValidationProgress,
  ValidationRunSummary,
  ValidationMetrics,
} from './results';

export type {
  ValidationRunActivityEventSnapshot,
  ValidationRunInFlightResourceTypeSnapshot,
  ValidationRunLifecycleStatus,
  ValidationRunOutcome,
  ValidationRunResourceTypeSnapshot,
  ValidationRunSnapshotV1,
  ValidationRunTerminationCause,
} from './run-snapshot';

export type { EvaluationPlanSnapshot, EvaluationScopeRequirement } from './evaluation-plan';
export type { EvaluationAssessmentSnapshot, EvaluationLaneStatus } from './evaluation-assessment';

export type {
  ValidationIssueResourceTypeMetricsV1,
  ValidationIssueSeverityMetricsV1,
  ValidationIssueSummaryMetrics,
  ValidationIssueSummaryScopeV1,
  ValidationIssueSummarySeverity,
  ValidationIssueSummaryV1,
} from './issue-summary';

export type {
  ValidationQualityMetrics,
  ValidationAccuracyMetrics,
  ValidationConsistencyMetrics,
  ValidationPerformanceMetrics,
  ValidationReliabilityMetrics,
  ValidationAspectQuality,
  ValidationQualityTrend,
  ValidationAspectQualityTrend,
  ValidationQualityRecommendation,
  ValidationQualityConfig,
  ValidationQualityReport,
  ValidationConfidenceFactors,
  ValidationConfidenceIssue,
  ValidationConfidenceMetrics,
  ValidationResultWithConfidence,
  ValidationConfidenceAction,
  ValidationCompletenessFactors,
  ValidationCoverageMetrics,
  MissingValidationArea,
  ValidationGap,
  ValidationCompletenessMetrics,
  ValidationResultWithCompleteness,
  ValidationCompletenessAction,
} from './validation-advanced-metrics';

export type {
  ProfileSourcesConfig,
  ValidationAspectConfig,
  TerminologyServer,
  TerminologyAuthConfig,
  CircuitBreakerConfig,
  ValidationSettings,
  ValidationSettingsUpdate,
  ValidationSettingsValidationResult,
  FHIRResourceTypeConfig,
  AdvancedTerminologyConfig,
  MiiPreset,
  MiiValidationSettings,
  ProfileApplicationSource,
  ImposedProfilePolicy,
  ImposedProfilesConfig,
  AdvisorRule,
  AdvisorRuleApplication,
  AdvisorRuleMatch,
  AdvisorRuleTransform
} from './settings';

export type {
  CredentialPresenceHints,
  PublicTerminologyAuthConfig,
  PublicTerminologyServer,
  PublicValidationSettings,
} from './settings-public';

export { PERFORMANCE_LIMITS } from './settings';

export {
  COMMON_FHIR_RESOURCE_TYPES,
  CONFORMANCE_RESOURCE_TYPES,
  R4_ALL_RESOURCE_TYPES,
  R5_ALL_RESOURCE_TYPES,
  R4_DEFAULT_INCLUDED_RESOURCE_TYPES,
  R5_DEFAULT_INCLUDED_RESOURCE_TYPES,
  type CommonFhirResourceType,
} from './settings-types';

export {
  DEFAULT_VALIDATION_SETTINGS_R4,
  DEFAULT_VALIDATION_SETTINGS_R5,
  DEFAULT_ADVANCED_TERMINOLOGY,
  VALIDATION_CONFIGS,
  DEFAULT_TERMINOLOGY_SERVERS,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CACHE_CONFIG,
  createEhds2026ValidationSettings,
  createMii2026ValidationSettings,
  FHIR_CORE_PACKAGE_SET,
  FHIR_CORE_PACKAGE_VERSIONS,
  FHIR_CORE_EXTENSION_PACKAGE_SET,
  FHIR_CORE_EXTENSION_PACKAGE_VERSIONS,
  FHIR_CORE_TERMINOLOGY_PACKAGE_SET,
  FHIR_CORE_TERMINOLOGY_PACKAGE_VERSIONS,
  HL7_EU_EHDS_2026_PACKAGE_SET,
  HL7_EU_EHDS_2026_PACKAGE_VERSIONS,
  HL7_EU_EPS_XTEHR_REFERENCE_PACKAGE,
  IPS_PACKAGE_VERSION,
  MII_2026_PACKAGE_SET,
  MII_2026_PACKAGE_VERSIONS,
  type FhirPackagePin,
  type Mii2026ValidationSettingsOverrides,
  type MiiTerminologyMode
} from './settings-defaults';

export {
  BUNDLED_PROFILE_PRESETS,
  getBundledProfilePlan,
  isBundledProfilePreset,
  parseBundledProfilePreset,
  type BundledProfilePlan,
  type BundledProfilePreset,
} from './defaults/bundled-profile-plan';

export {
  validatePerformanceSettings,
  validateResourceTypeSettings,
  validateResourceTypeSettingsForVersion,
  validateValidationSettings,
} from './settings-validators';

export {
  DEFAULT_PROFILE_SOURCES_CONFIG,
  normalizeProfileSourcesConfig,
  parseSettings,
  parseSettingsUpdate,
  safeParseSettings,
  safeParseSettingsUpdate,
  ValidationSettingsSchema,
  ValidationSettingsUpdateSchema,
} from './settings-schema';

export {
  getAllResourceTypesForVersion,
  getDefaultIncludedTypesForVersion,
  isResourceTypeAvailableInVersion,
  getUnavailableResourceTypes,
  getR5SpecificResourceTypes,
  migrateResourceTypesForVersion,
  getEffectiveResourceTypes,
  shouldValidateResourceType,
} from './settings-transformers';

export {
  decideResourceValidationEligibility,
  planResourceValidation,
  type PlannedResourceValidation,
  type PlannedResourceValidationSkip,
  type ResourceTypeValidationPolicy,
  type ResourceValidationEligibilityDecision,
  type ResourceValidationEligibilityReason,
  type ResourceValidationOperation,
  type ResourceValidationPolicyAnnotation,
} from './resource-validation-eligibility';

export {
  getDefaultPerformanceSettings,
  getDefaultResourceTypeSettings,
  getDefaultValidationSettingsForVersion,
  getDefaultValidationSettings,
  createDefaultValidationSettings,
  resetToDefaultSettings,
  isDefaultSettings,
  getEnabledAspects,
  isAspectEnabled,
  getAspectSeverity,
} from './settings-utils';

// ============================================================================
// Versioned quality rule packs
// ============================================================================

export {
  QUALITY_NORMATIVE_STATUSES,
  QUALITY_ADVISORY_ACTIONS,
  QUALITY_FINDING_DISPOSITIONS,
  QUALITY_RULE_OUTCOMES,
  QUALITY_RULE_SCOPES,
  QUALITY_RULE_SEVERITIES,
  parseQualityRulePackManifest,
  qualityPolicyLayerSchema,
  qualityAdvisoryRuleDefinitionSchema,
  qualityRuleDefinitionSchema,
  qualityRuleImplementationSchema,
  qualityRulePackManifestSchema,
  qualityReferenceSetDefinitionSchema,
  qualityRuleOverrideSchema,
  type QualityComparisonClass,
  type QualityAdvisoryAction,
  type QualityAdvisoryRuleDefinition,
  type QualityFindingDisposition,
  type QualityNormativeStatus,
  type QualityPolicyLayer,
  type QualityRuleDefinition,
  type QualityRuleImplementation,
  type QualityRuleOutcome,
  type QualityRuleOverride,
  type QualityRulePackManifest,
  type QualityReferenceSetDefinition,
  type QualityRuleScope,
  type QualityRuleSeverity,
} from './quality-rule-pack';
export type {
  EffectiveQualityAdvisoryRule,
  EffectiveQualityPolicyLayerReference,
  EffectiveQualityPolicySnapshot,
  EffectiveQualityRule,
} from './effective-quality-policy';
export type {
  QualityAdvisoryApplication,
  QualityAdvisoryConflict,
  QualityAdvisorySummary,
  QualityAssessmentSnapshot,
  QualityMetric,
  QualityRuleFinding,
} from './quality-assessment';
export {
  parseQualityRulePackDraftManifest,
  qualityRulePackDraftManifestSchema,
  type QualityRulePackDraftManifest,
  type QualityRulePackDraftTestSummary,
} from './quality-rule-pack-draft';

// ============================================================================
// DTOs and Utility Functions
// ============================================================================

export type {
  MessageSignatureComponents,
  MessageSignatureResult,
  RawValidationMessage,
  NormalizedValidationMessage,
  ValidationResultPerAspectDTO,
  AggregatedValidationResult,
  ValidationMessageGroupDTO,
  ValidationGroupMemberDTO,
  ResourceMessagesDTO,
  ValidationSettingsSnapshot
} from './dtos';

export {
  computeValidationScore,
  aggregateAspectScores,
  normalizeCanonicalPath,
  normalizeMessageText
} from './dtos';

export { removeAsciiControlCharacters } from './text-normalization';

export type { ValidationIssueIdentityInput } from './issue-identity';

export {
  computeValidationIssueId,
  stableStringify
} from './issue-identity';

export {
  getEffectiveIssueRuleId,
  getSpecificIssueRuleId,
  type IssueRuleIdentityInput,
} from './issue-rule-id';

export type {
  ValidationIssueConfidence,
  ValidationIssueProvenance,
  ValidationIssueProvenanceInput,
  ValidationIssueSourceExecutor,
  ValidationIssueVerificationState,
} from './issue-provenance';

export {
  buildValidationIssueProvenance,
  inferValidationIssueSourceExecutor,
} from './issue-provenance';
