/**
 * Records Validator - Main Export
 *
 * Pure JavaScript/TypeScript FHIR Validation Engine.
 *
 * Usage:
 *   import { recordsValidator } from '@records-fhir/validator';
 *   const issues = await recordsValidator.validate(resource, profileUrl);
 */

export {
  ensureRecordsValidatorReady,
  getRecordsValidatorClass,
  recordsValidator,
} from './validator-singleton';
export type { RecordsValidatorSingleton } from './validator-singleton';

export { toInternalFhirVersion } from './public-validation-api';
export type {
  PublicBatchValidationOptions,
  PublicFhirVersion,
  PublicValidationInput,
  PublicValidationRequest,
  PublicValidationResult,
} from './public-validation-api';

// Validator classes kept on the root surface for backward compatibility.
export { ExtensionValidator } from './validators/extension-validator';
export { SlicingValidator } from './validators/slicing-validator';
export { ValueSetValidator } from './validators/valueset-validator';
export { ConstraintValidator } from './validators/constraint-validator';
export type { FHIRPathConstraintDiagnostics } from './validators/constraint-validator';
export { SnapshotGenerator } from './core/snapshot-generator';

export type { RecordsValidatorConfig, ValidationContext } from './core/validator-engine';
export type { StructureDefinition, ElementDefinition } from './core/structure-definition-types';

export { setEngineLogger } from './logger';
export type { EngineLogger } from './logger';
export {
  getCustomRulesSource,
  getProfileSource,
  setCustomRulesSource,
  setProfileSource,
} from './persistence';
export type {
  CustomRulesSource,
  EngineCustomRule,
  ProfileResolutionEntry,
  ProfileSource,
} from './persistence';
export { createFilesystemProfileSource } from './persistence/filesystem-profile-source';
export type { FilesystemProfileSourceOptions } from './persistence/filesystem-profile-source';

// Issue helpers used by the public CLI/action and fix-suggestion integrations.
export {
  applyFixPatch,
  createValidationIssue,
  FixSuggestions,
  formatFixSuggestion,
  getFixSuggestion,
  issueFingerprint,
  issueMatchesAnchor,
  issuePathMatchesPattern,
  stableIssues,
  summarizeIssueAnchors,
  summarizeIssueFingerprints,
  type CreateIssueParams,
  type ExpectedIssueAnchor,
  type FixApplyResult,
  type FixSuggestion,
  type StableIssueSummaryOptions,
} from './issues';

export {
  checkFhirpathSandbox,
  type SandboxLimits,
  type SandboxResult,
} from './validators/fhirpath-sandbox';
