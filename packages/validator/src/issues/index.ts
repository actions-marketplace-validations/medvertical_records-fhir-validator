/**
 * Engine Issues — Issue-factory + Fix-suggestion Boundary
 *
 * Re-exports the issue-construction helpers consumed by every engine
 * module. The implementations live next to this file
 * (`./issue-factory.ts`, `./fix-suggestions.ts`,
 * `./message-catalog.ts`, `./message-templates.ts`) — physical
 * extraction from `server/services/validation/` happened during the
 * engine-extraction work; this index file is what other engine
 * modules and a few external server consumers (HAPI pipeline,
 * server-side error mapping and metadata validators) import.
 *
 * Re-exports keep consumers on one stable construction API while the
 * implementation remains split into focused modules.
 */

export {
    type CreateIssueParams,
    createValidationIssue,
    createBindingViolation,
    createBindingUnverified,
    createValueSetUnavailable,
    createRequiredElementMissing,
    createReferenceTypeMismatch,
    createConstraintViolation,
    createValidationError,
    resetIssueCounter,
} from './issue-factory';

export {
    type FixSuggestion,
    FixSuggestions,
    getFixSuggestion,
    formatFixSuggestion,
} from './fix-suggestions';

export {
    applyFixPatch,
    type FixApplyResult,
} from './fix-applier';

export {
    issueFingerprint,
    issueMatchesAnchor,
    issuePathMatchesPattern,
    stableIssues,
    summarizeIssueAnchors,
    summarizeIssueFingerprints,
    type ExpectedIssueAnchor,
    type StableIssueSummaryOptions,
} from './issue-contract';
