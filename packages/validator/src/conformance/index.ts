/**
 * Evidence and conformance tooling surface for @records-fhir/validator.
 *
 * This subpath is for repository-owned quality gates, conformance runners,
 * parity harnesses, and package smoke tests. It keeps those tools off
 * internal source paths while making the non-product APIs explicit.
 */

export { RecordsValidator } from '../core/validator-engine';
export type { RecordsValidatorConfig, ValidationContext } from '../core/validator-engine';
export {
  issueToOperationOutcomeIssue,
  toOperationOutcome,
} from '../core/operation-outcome-converter';
export type {
  FhirOperationOutcome,
  FhirOperationOutcomeIssue,
} from '../core/operation-outcome-converter';
export { InvariantRegistry } from '../validators/invariant-registry';
export { ValueSetCache, valueSetCache } from '../validators/valueset-cache';
export type { ServerExpansionEntry } from '../validators/valueset-cache';
export type {
  CodeSystem,
  TerminologyResolutionConfig,
  ValueSet,
} from '../validators/valueset-types';
export { setEngineLogger } from '../logger';
export type { EngineLogger } from '../logger';
export type {
  ValidationIssue,
  ValidationSettings,
} from '../types';
