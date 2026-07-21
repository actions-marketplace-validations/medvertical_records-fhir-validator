/**
 * Host embedding surface for @records-fhir/validator.
 *
 * This subpath is the stable contract for applications that embed the
 * standalone validator and need to wire host services such as logging,
 * profile resolution, custom rules, package installation, or validation
 * warmup lifecycle hooks.
 *
 * Runtime validators should keep using the package root. Host applications
 * should prefer this file over importing internal `core/*` modules directly.
 */

export { setEngineLogger } from '../logger';
export type { EngineLogger } from '../logger';

export {
  getCustomRulesSource,
  getProfileSource,
  setCustomRulesSource,
  setProfileSource,
} from '../persistence';
export type {
  CustomRulesSource,
  EngineCustomRule,
  ProfileResolutionEntry,
  ProfileSourceContext,
  ProfileSource,
} from '../persistence';
export { createFilesystemProfileSource } from '../persistence/filesystem-profile-source';
export type { FilesystemProfileSourceOptions } from '../persistence/filesystem-profile-source';

export { resetWarmupState } from '../core/batch-utils';
export {
  dedupeIssues,
  dedupeIssuesWithTrace,
  suppressRedundantBindingWarnings,
} from '../core/validation-utils';
export type {
  DedupeIssuesResult,
  DedupeSuppressionTrace,
} from '../core/validation-utils';
export { detailedResultToOperationOutcome } from '../core/operation-outcome-converter';
export { isPrimitiveType } from '../core/executors/structural-executor-helpers';
export { CustomRuleExecutor } from '../core/executors/custom-rule-executor';
export { RuleRegistry } from '../business-rules/rule-registry';
export { getCombinedFHIRPathCacheStats } from '../validators/constraint-validator';
export {
  normalizeKnownStructureDefinitionCanonicalUrl,
  StructureDefinitionLoader,
} from '../core/structure-definition-loader';
export { scanCacheDirectory } from '../core/sd-loader-package-scanner';
export type { ScanCacheDirectoryOptions } from '../core/sd-loader-package-scanner';
export { loadFromPersistentIndex } from '../core/sd-loader-persistent-index';
export type { PersistentIndexOptions } from '../core/sd-loader-persistent-index';
export {
  isPackageAllowed,
  parseAllowedPackages,
} from '../core/sd-loader-package-config';
export type {
  Binding,
  Constraint,
  ElementDefinition,
  ElementType,
  StructureDefinition,
} from '../core/structure-definition-loader';
export {
  PackageDownloader,
  packageDownloader,
} from '../package/package-downloader';
export {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_TOTAL_BYTES,
  isSafePackageArchiveEntry,
  isSafePackageId,
  isSafePackageVersion,
  packageErrorMetadata,
  packageReferenceMetadata,
  packageTargetMetadata,
} from '../package/package-artifact-policy';
export type {
  DownloadResult,
  PackageDownloadOptions,
} from '../package/package-downloader';

export {
  createBindingUnverified,
  createBindingViolation,
  createConstraintViolation,
  createReferenceTypeMismatch,
  createRequiredElementMissing,
  createValidationError,
  createValidationIssue,
  resetIssueCounter,
  type CreateIssueParams,
} from '../issues';
export {
  BusinessRuleCodes,
  getCodeMetadata,
  isKnownCode,
  loadCodeAliases,
  MetadataCodes,
  ProfileCodes,
  ReferenceCodes,
  resolveCode,
  StructuralCodes,
  TerminologyCodes,
  ValidationCodes,
} from '../issues/codes';
export type {
  BusinessRuleCode,
  MetadataCode,
  ProfileCode,
  ReferenceCode,
  StructuralCode,
  TerminologyCode,
  ValidationCode,
  ValidationCodeMetadata,
} from '../issues/codes';
export { CodeAliases } from '../issues/codes/code-aliases';
export {
  formatMessage,
  getHumanReadableMessage,
  HumanReadableTemplates,
  MessageTemplates,
} from '../issues/message-templates';
