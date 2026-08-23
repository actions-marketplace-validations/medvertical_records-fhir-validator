/** Stable internal surface for dedupe key, path, terminology, and reference helpers. */
export { getDetailsRecord, getIssuePath } from './validation-issue-dedupe-common';
export {
  getInvalidProfileCanonicalValue,
  getInvalidQuestionnaireCanonicalReferenceKey,
  getQuestionnaireAnswerOptionDisallowedPath,
  getQuestionnaireReferenceWarningKey,
  getScopedMustSupportPath,
  isRedundantMetadataProfileInvalidUrlIssue,
  isRedundantProfileNotResolvedWarning,
  isSliceSpecificMustSupportIssue,
  normalizeNarrativeMissingDivPath,
  normalizeNarrativeTextPath,
  normalizeQuestionnairePathWithIndices,
  normalizeRequiredElementPath,
} from './validation-issue-dedupe-path-utils';
export {
  getBundleReferenceIssueKey,
  getIssueReferenceValue,
  normalizeBundleRequestPath,
} from './validation-issue-dedupe-reference-utils';
export {
  compareDisplayMismatchSpecificity,
  compareInvalidUriSpecificity,
  compareTerminologyCodeInvalidSpecificity,
  getInvalidUriIssueKey,
  getTerminologyCodeInvalidKey,
  getTerminologyDisplayMismatchKey,
} from './validation-issue-dedupe-terminology-utils';
