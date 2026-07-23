import type { ValidationIssue } from '../types';
import {
  getConstraintDedupeKeys,
  isBundleDuplicateFullUrlIssue,
  normalizeIssuePathForDedupe,
} from './validation-issue-dedupe-constraints';
import {
  compareDisplayMismatchSpecificity,
  compareInvalidUriSpecificity,
  compareTerminologyCodeInvalidSpecificity,
  getBundleReferenceIssueKey,
  getInvalidProfileCanonicalValue,
  getInvalidQuestionnaireCanonicalReferenceKey,
  getInvalidUriIssueKey,
  getIssuePath,
  getIssueReferenceValue,
  getQuestionnaireAnswerOptionDisallowedPath,
  getQuestionnaireReferenceWarningKey,
  getScopedMustSupportPath,
  getTerminologyDisplayMismatchKey,
  getTerminologyCodeInvalidKey,
  isRedundantMetadataProfileInvalidUrlIssue,
  isRedundantProfileNotResolvedWarning,
  isSliceSpecificMustSupportIssue,
  normalizeBundleRequestPath,
  normalizeNarrativeMissingDivPath,
  normalizeNarrativeTextPath,
  normalizeQuestionnairePathWithIndices,
  normalizeRequiredElementPath,
} from './validation-issue-dedupe-utils';
import {
  getEffectiveRuleId,
  getSpecificConstraintKey,
  isGermanGenderExtensionMissingIssue,
  isInvariantSpecificConstraintIssue,
  isMiiGenderConstraintIssue,
  isRedundantBundleInvariantIssue,
  isRedundantBundleInvariantPresenceIssue,
  isRedundantGenericConstraintIssue,
  isRedundantMetadataMissingTimezoneIssue,
  isRedundantNameInvariantIssue,
  isRedundantProfileSpecificConstraintIssue,
  isRedundantQuestionnaireQue1bIssue,
  isRedundantRequiredElementIssue,
  isSpecificNameInvariantIssue,
  isStructuralDateTimeMissingTimezoneIssue,
} from './validation-issue-dedupe-profile-suppressions';

/**
 * Dedupe issues by (code, path, severity, rule). Prevents reporting the same
 * constraint violation (e.g. dom-6) multiple times when several validators
 * independently re-check the same rule, while preserving distinct slice
 * cardinality failures that legitimately share one base path.
 */
export function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return dedupeIssuesWithTrace(issues).issues;
}

/**
 * Remove only logically identical diagnostics without applying cross-code
 * suppression. This is used when independently validated child resources are
 * appended after the parent's semantic suppression pass: re-running semantic
 * suppression over the combined list can create cycles where two legitimate
 * representations suppress each other.
 */
export function dedupeExactIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const details = issue.details;
    const detailRuleKey = details && typeof details === 'object' && !Array.isArray(details)
      ? [
        (details as Record<string, unknown>).constraintKey ?? (details as Record<string, unknown>).sliceName,
        (details as Record<string, unknown>).sourceProfile,
      ].filter(value => typeof value === 'string' && value.length > 0).join(':')
      : undefined;
    const ruleKey = [getEffectiveRuleId(issue), detailRuleKey]
      .filter(value => typeof value === 'string' && value.length > 0)
      .join(':');
    const key = getSemanticDedupeKey(issue, ruleKey);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

/**
 * Final resource-tree cleanup after recursively validated contained resources
 * have been appended. Keep this deliberately narrower than the normal
 * semantic suppression pass: only exact copies and the known parent/child
 * canonical-URI duplicate are removed.
 */
export function dedupeResourceTreeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const exact = issues.filter(issue => {
    const details = issue.details;
    const detailRuleKey = details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>).constraintKey ?? (details as Record<string, unknown>).sliceName
      : undefined;
    const ruleKey = [getEffectiveRuleId(issue), detailRuleKey]
      .filter(value => typeof value === 'string' && value.length > 0)
      .join(':');
    const key = [
      issue.code,
      normalizeResourceTreePath(issue),
      issue.severity,
      ruleKey,
      issue.message,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const specificCanonicalPaths = new Set(
    exact
      .filter(issue => issue.code === 'tx-codesystem-url-not-absolute')
      .map(normalizeResourceTreePath),
  );
  return exact.filter(issue =>
    issue.code !== 'structural-invalid-uri' ||
    !specificCanonicalPaths.has(normalizeResourceTreePath(issue))
  );
}

function normalizeResourceTreePath(issue: ValidationIssue): string {
  return (issue.path || getIssuePath(issue))
    .trim()
    .replace(/\/\*[^*]*\*\//g, '')
    .replace(/\.+/g, '.')
    .replace(/\.$/, '')
    .toLowerCase();
}

export interface DedupeSuppressionTrace {
  readonly ruleId: string;
  readonly issue: ValidationIssue;
}

export interface DedupeIssuesResult {
  readonly issues: ValidationIssue[];
  readonly suppressions: DedupeSuppressionTrace[];
}

export function dedupeIssuesWithTrace(issues: ValidationIssue[]): DedupeIssuesResult {
  return processIssues(issues, true);
}

/**
 * Apply only cross-issue semantic suppression. Exact/logical identity remains
 * the responsibility of callers such as the persistence layer.
 */
export function suppressSemanticIssuesWithTrace(issues: ValidationIssue[]): DedupeIssuesResult {
  return processIssues(issues, false);
}

function processIssues(issues: ValidationIssue[], dedupeExactIssues: boolean): DedupeIssuesResult {
  const specificBundleInvariantKeys = new Set<string>();
  const bundleInvariantPresencePaths = new Set<string>();
  const specificConstraintKeys = new Set<string>();
  const invariantSpecificConstraintKeys = new Set<string>();
  const cardinalityMinPaths = new Set<string>();
  const profileExtensionMinPaths = new Set<string>();
  const profileSliceMinPaths = new Set<string>();
  const profileExtensionMaxKeys = new Set<string>();
  const mustSupportPaths = new Set<string>();
  const ref1InvariantPaths = new Set<string>();
  const invalidUriPaths = new Set<string>();
  const invalidTerminologySystemPaths = new Set<string>();
  const invalidQuestionnaireCanonicalReferences = new Set<string>();
  const invalidProfileCanonicalValues = new Set<string>();
  const containedInvalidPaths = new Set<string>();
  const requiredBindingViolationPaths = new Set<string>();
  const extensionNoValuePaths = new Set<string>();
  const narrativeMissingDivPaths = new Set<string>();
  const narrativeMissingDivTextPaths = new Set<string>();
  const structuralDom3ContainedKeys = new Set<string>();
  const structuralInvalidReferenceValues = new Set<string>();
  const structuralReferenceTargetValues = new Set<string>();
  const bundleRequestMissingUrlPaths = new Set<string>();
  const bundleCrossEntryReferenceKeys = new Set<string>();
  const terminologyMissingSystemPaths = new Set<string>();
  const specificRequiredElementPaths = new Set<string>();
  const structuralDateTimeMissingTimezonePaths = new Set<string>();
  const specificCanonicalInvalidPaths = new Set<string>();
  const specificNameInvariantPaths = new Set<string>();
  const questionnaireQue1Paths = new Set<string>();
  const questionnaireAnswerOptionDisallowedPaths = new Set<string>();
  const sliceSpecificMustSupportPaths = new Set<string>();
  const preferredInvalidUriIssues = new Map<string, ValidationIssue>();
  const preferredDisplayMismatchIssues = new Map<string, ValidationIssue>();
  const preferredTerminologyCodeInvalidIssues = new Map<string, ValidationIssue>();
  const hasGermanGenderExtensionMissing = issues.some(isGermanGenderExtensionMissingIssue);
  for (const issue of issues) {
    const terminologyCodeInvalidKey = getTerminologyCodeInvalidKey(issue);
    if (terminologyCodeInvalidKey) {
      const existing = preferredTerminologyCodeInvalidIssues.get(terminologyCodeInvalidKey);
      if (!existing || compareTerminologyCodeInvalidSpecificity(issue, existing) > 0) {
        preferredTerminologyCodeInvalidIssues.set(terminologyCodeInvalidKey, issue);
      }
    }
    const displayMismatchKey = getTerminologyDisplayMismatchKey(issue);
    if (displayMismatchKey) {
      const existing = preferredDisplayMismatchIssues.get(displayMismatchKey);
      if (!existing || compareDisplayMismatchSpecificity(issue, existing) > 0) {
        preferredDisplayMismatchIssues.set(displayMismatchKey, issue);
      }
    }
    const invalidUriKey = getInvalidUriIssueKey(issue);
    if (invalidUriKey) {
      const existing = preferredInvalidUriIssues.get(invalidUriKey);
      if (!existing || compareInvalidUriSpecificity(issue, existing) > 0) {
        preferredInvalidUriIssues.set(invalidUriKey, issue);
      }
    }
    if (issue.code === 'bdl-9-violation') {
      specificBundleInvariantKeys.add('bdl-9');
      bundleInvariantPresencePaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'bdl-10-violation') {
      specificBundleInvariantKeys.add('bdl-10');
      bundleInvariantPresencePaths.add(normalizeRequiredElementPath(issue));
    }
    if (isBundleDuplicateFullUrlIssue(issue)) {
      specificBundleInvariantKeys.add('bdl-7');
    }
    const constraintKey = getSpecificConstraintKey(issue);
    if (constraintKey) {
      for (const key of getConstraintDedupeKeys(issue, constraintKey)) {
        specificConstraintKeys.add(key);
        if (isInvariantSpecificConstraintIssue(issue)) {
          invariantSpecificConstraintKeys.add(key);
        }
      }
    }
    if (issue.code === 'structural-cardinality-min') {
      cardinalityMinPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'profile-extension-min-cardinality') {
      profileExtensionMinPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'profile-slice-min-cardinality') {
      profileSliceMinPaths.add(normalizeRequiredElementPath(issue));
    }
    const extensionMaxKey = getExtensionMaxCardinalityKey(issue);
    if (issue.code === 'profile-extension-max-cardinality' && extensionMaxKey) {
      profileExtensionMaxKeys.add(extensionMaxKey);
    }
    if (issue.code === 'profile-mustsupport-missing') {
      mustSupportPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'ref-1-violation') {
      ref1InvariantPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'structural-invalid-uri') {
      invalidUriPaths.add(normalizeRequiredElementPath(issue));
      const profileCanonical = getInvalidProfileCanonicalValue(issue);
      if (profileCanonical) invalidProfileCanonicalValues.add(profileCanonical);
      const key = getInvalidQuestionnaireCanonicalReferenceKey(issue);
      if (key) invalidQuestionnaireCanonicalReferences.add(key);
    }
    if (issue.code === 'tx-codesystem-url-not-absolute') {
      specificCanonicalInvalidPaths.add(normalizeRequiredElementPath(issue));
    }
    if (isTerminologySystemInvalidIssue(issue)) {
      invalidTerminologySystemPaths.add(normalizeRequiredElementPath(issue));
    }
    if (isContainedUnreferencedInvalidIssue(issue)) {
      containedInvalidPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'profile-required-binding-violation') {
      requiredBindingViolationPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'profile-extension-no-value') {
      extensionNoValuePaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'narrative-missing-div') {
      narrativeMissingDivPaths.add(normalizeNarrativeMissingDivPath(issue));
      narrativeMissingDivTextPaths.add(normalizeNarrativeTextPath(issue));
    }
    const structuralDom3ContainedKey = getStructuralDom3ContainedIssueKey(issue);
    if (structuralDom3ContainedKey) {
      structuralDom3ContainedKeys.add(structuralDom3ContainedKey);
    }
    if (issue.code === 'reference-invalid-format') {
      const reference = getIssueReferenceValue(issue);
      if (reference) structuralInvalidReferenceValues.add(reference);
    }
    if (issue.code === 'reference-target-type-invalid') {
      const reference = getIssueReferenceValue(issue);
      if (reference) structuralReferenceTargetValues.add(reference);
    }
    if (issue.code === 'reference-bundle-request-missing-url') {
      bundleRequestMissingUrlPaths.add(normalizeBundleRequestPath(issue));
    }
    if (issue.code === 'bundle-cross-entry-reference-missing') {
      const key = getBundleReferenceIssueKey(issue);
      if (key) bundleCrossEntryReferenceKeys.add(key);
    }
    if (issue.aspect === 'terminology' && issue.code === 'terminology-coding-missing-system') {
      terminologyMissingSystemPaths.add(normalizeIssuePathForDedupe(issue));
    }
    if (isSpecificRequiredElementMissingIssue(issue)) {
      const path = normalizeRequiredElementPath(issue);
      specificRequiredElementPaths.add(path);
      cardinalityMinPaths.add(path);
    }
    if (isStructuralDateTimeMissingTimezoneIssue(issue)) {
      structuralDateTimeMissingTimezonePaths.add(normalizeIssuePathForDedupe(issue));
    }
    if (isSpecificNameInvariantIssue(issue)) {
      specificNameInvariantPaths.add(normalizeRequiredElementPath(issue));
    }
    if (issue.code === 'questionnaire-invariant-que-1') {
      questionnaireQue1Paths.add(normalizeRequiredElementPath(issue));
    }
    const questionnaireAnswerOptionPath = getQuestionnaireAnswerOptionDisallowedPath(issue);
    if (questionnaireAnswerOptionPath) {
      questionnaireAnswerOptionDisallowedPaths.add(questionnaireAnswerOptionPath);
    }
    if (isSliceSpecificMustSupportIssue(issue)) {
      sliceSpecificMustSupportPaths.add(getScopedMustSupportPath(issue));
    }
  }

  const suppressionRules: DedupeSuppressionRule[] = [
    { id: 'bundle-invariant-specific', suppress: issue => isRedundantBundleInvariantIssue(issue, specificBundleInvariantKeys) },
    { id: 'bundle-invariant-presence', suppress: issue => isRedundantBundleInvariantPresenceIssue(issue, bundleInvariantPresencePaths) },
    { id: 'constraint-specific-over-generic', suppress: issue => isRedundantGenericConstraintIssue(issue, specificConstraintKeys) },
    { id: 'profile-specific-over-invariant-specific', suppress: issue => isRedundantProfileSpecificConstraintIssue(issue, invariantSpecificConstraintKeys) },
    { id: 'specific-required-over-cardinality-min', suppress: issue => isRedundantCardinalityMinIssue(issue, specificRequiredElementPaths) },
    { id: 'german-gender-extension-over-mii-gender', suppress: issue => hasGermanGenderExtensionMissing && isMiiGenderConstraintIssue(issue) },
    { id: 'cardinality-min-over-required', suppress: issue => isRedundantRequiredElementIssue(issue, cardinalityMinPaths) },
    { id: 'profile-extension-min-over-required', suppress: issue => isRedundantRequiredElementIssue(issue, profileExtensionMinPaths) },
    { id: 'profile-slice-min-over-required', suppress: issue => isRedundantRequiredElementIssue(issue, profileSliceMinPaths) },
    { id: 'cardinality-min-over-best-practice-presence', suppress: issue => isRedundantBestPracticePresenceIssue(issue, cardinalityMinPaths) },
    { id: 'cardinality-min-over-required-binding', suppress: issue => isRedundantRequiredBindingIssue(issue, cardinalityMinPaths) },
    { id: 'profile-extension-min-over-structural-cardinality', suppress: issue => isRedundantProfileExtensionCardinalityIssue(issue, profileExtensionMinPaths) },
    { id: 'profile-slice-min-over-structural-cardinality', suppress: issue => isRedundantProfileSliceCardinalityIssue(issue, profileSliceMinPaths) },
    { id: 'extension-max-over-slice-max', suppress: issue => isRedundantExtensionSliceMaxIssue(issue, profileExtensionMaxKeys) },
    { id: 'mustsupport-over-best-practice-presence', suppress: issue => isRedundantMustSupportBestPracticeIssue(issue, mustSupportPaths) },
    { id: 'ref1-over-reference-format', suppress: issue => isRedundantReferenceFormatIssue(issue, ref1InvariantPaths) },
    { id: 'invalid-system-over-terminology-not-found', suppress: issue => isRedundantTerminologyNotFoundIssue(issue, invalidUriPaths, invalidTerminologySystemPaths) },
    { id: 'specific-canonical-over-structural-uri', suppress: issue =>
      issue.code === 'structural-invalid-uri' && specificCanonicalInvalidPaths.has(normalizeRequiredElementPath(issue)) },
    { id: 'invalid-questionnaire-canonical-over-reference-warning', suppress: issue => isRedundantQuestionnaireReferenceWarning(issue, invalidQuestionnaireCanonicalReferences) },
    { id: 'invalid-profile-canonical-over-profile-unresolved', suppress: issue => isRedundantProfileNotResolvedWarning(issue, invalidProfileCanonicalValues) },
    { id: 'invalid-profile-canonical-over-metadata-profile-url', suppress: issue => isRedundantMetadataProfileInvalidUrlIssue(issue, invalidProfileCanonicalValues) },
    { id: 'contained-invalid-over-unreferenced', suppress: issue => isRedundantContainedUnreferencedIssue(issue, containedInvalidPaths) },
    { id: 'required-binding-over-presence-invariant', suppress: issue => isRedundantPresenceInvariantIssue(issue, requiredBindingViolationPaths) },
    { id: 'extension-no-value-over-ext1', suppress: issue => isRedundantExtensionConstraintIssue(issue, extensionNoValuePaths) },
    { id: 'narrative-div-over-required', suppress: issue => isRedundantNarrativeRequiredElementIssue(issue, narrativeMissingDivPaths) },
    { id: 'narrative-text-over-dom6', suppress: issue => isRedundantDom6Issue(issue, narrativeMissingDivTextPaths) },
    { id: 'contained-invalid-over-profile-dom3', suppress: issue => isRedundantProfileDom3Issue(issue, structuralDom3ContainedKeys) },
    { id: 'structural-invalid-reference-over-generic', suppress: issue => isRedundantGenericInvalidReferenceIssue(issue, structuralInvalidReferenceValues) },
    { id: 'structural-invalid-reference-over-unresolved', suppress: issue => isRedundantUnresolvedInvalidReferenceIssue(issue, structuralInvalidReferenceValues) },
    { id: 'structural-reference-target-over-type-mismatch', suppress: issue => isRedundantReferenceTypeMismatchIssue(issue, structuralReferenceTargetValues) },
    { id: 'bundle-request-url-over-required', suppress: issue => isRedundantBundleRequestRequiredElementIssue(issue, bundleRequestMissingUrlPaths) },
    { id: 'bundle-cross-entry-over-unresolved', suppress: issue => isRedundantBundleReferenceIssue(issue, bundleCrossEntryReferenceKeys) },
    { id: 'terminology-missing-system-over-profile-copy', suppress: issue => isRedundantProfileMissingSystemIssue(issue, terminologyMissingSystemPaths) },
    { id: 'terminology-missing-system-over-metadata-tag', suppress: issue => isRedundantMetadataTagCodeWithoutSystemIssue(issue, terminologyMissingSystemPaths) },
    { id: 'specific-invalid-uri-preferred', suppress: issue => isRedundantInvalidUriIssue(issue, preferredInvalidUriIssues) },
    { id: 'specific-display-mismatch-preferred', suppress: issue => isRedundantTerminologyDisplayMismatchIssue(issue, preferredDisplayMismatchIssues) },
    { id: 'specific-terminology-code-invalid-preferred', suppress: issue => isRedundantTerminologyCodeInvalidIssue(issue, preferredTerminologyCodeInvalidIssues) },
    { id: 'structural-timezone-over-metadata-timezone', suppress: issue => isRedundantMetadataMissingTimezoneIssue(issue, structuralDateTimeMissingTimezonePaths) },
    { id: 'specific-name-invariant-over-generic', suppress: issue => isRedundantNameInvariantIssue(issue, specificNameInvariantPaths) },
    { id: 'que1-over-que1b', suppress: issue => isRedundantQuestionnaireQue1bIssue(issue, questionnaireQue1Paths) },
    { id: 'answer-option-value-over-cardinality', suppress: issue => isRedundantQuestionnaireAnswerOptionValueCardinalityIssue(issue, questionnaireAnswerOptionDisallowedPaths) },
    { id: 'slice-specific-mustsupport-over-generic', suppress: issue => isRedundantGenericMustSupportIssue(issue, sliceSpecificMustSupportPaths) },
  ];

  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  const suppressions: DedupeSuppressionTrace[] = [];
  for (const issue of issues) {
    const suppressionRuleId = getSuppressionRuleId(issue, suppressionRules);
    if (suppressionRuleId) {
      suppressions.push({ ruleId: suppressionRuleId, issue });
      continue;
    }

    const details = issue.details;
    const detailRuleKey = details && typeof details === 'object' && !Array.isArray(details)
      ? [
        (details as Record<string, unknown>).constraintKey ?? (details as Record<string, unknown>).sliceName,
        (details as Record<string, unknown>).sourceProfile,
      ].filter(value => typeof value === 'string' && value.length > 0).join(':')
      : undefined;
    const ruleKey = [getEffectiveRuleId(issue), detailRuleKey]
      .filter(value => typeof value === 'string' && value.length > 0)
      .join(':');
    const key = getSemanticDedupeKey(issue, ruleKey);
    if (!dedupeExactIssues || !seen.has(key)) {
      seen.add(key);
      out.push(issue);
    }
  }
  return { issues: out, suppressions };
}

interface DedupeSuppressionRule {
  readonly id: string;
  suppress(issue: ValidationIssue): boolean;
}

function getSuppressionRuleId(issue: ValidationIssue, rules: DedupeSuppressionRule[]): string | null {
  for (const rule of rules) {
    if (rule.suppress(issue)) return rule.id;
  }
  return null;
}

function getSemanticDedupeKey(issue: ValidationIssue, ruleKey: string): string {
  const pathKey = issue.code === 'profile-mustsupport-missing'
    ? normalizeRequiredElementPath(issue)
    : normalizeIssuePathForDedupe(issue);
  if (issue.code === 'dom-6') {
    return `${issue.code}:${pathKey}:${issue.severity}`;
  }
  // A required child can be discovered both by the structural snapshot walk
  // and by the matched-slice content walk. The latter adds `sliceName` to the
  // rule key, but both diagnostics still describe the same missing value at
  // the same concrete instance path. Keep one row while preserving distinct
  // cardinalities/messages at that path.
  if (issue.code === 'structural-cardinality-min') {
    return `${issue.code}:${pathKey}:${issue.severity}:${issue.message}`;
  }
  // Generic HL7 issue codes (and other diagnostics without an explicit rule)
  // can legitimately describe multiple failures at the same element. The
  // message is their only rule identity; omitting it collapsed, for example,
  // a missing contained-resource id and an unreferenced-contained dom-3 error
  // into one `invalid` issue at the same normalized path.
  const effectiveRuleKey = ruleKey || issue.message;
  return `${issue.code}:${pathKey}:${issue.severity}:${effectiveRuleKey}`;
}

function isRedundantInvalidUriIssue(issue: ValidationIssue, preferredIssues: Map<string, ValidationIssue>): boolean {
  const key = getInvalidUriIssueKey(issue);
  if (!key) return false;
  const preferred = preferredIssues.get(key);
  return Boolean(preferred && preferred !== issue);
}

function isRedundantTerminologyDisplayMismatchIssue(
  issue: ValidationIssue,
  preferredIssues: Map<string, ValidationIssue>,
): boolean {
  const key = getTerminologyDisplayMismatchKey(issue);
  if (!key) return false;
  const preferred = preferredIssues.get(key);
  return Boolean(preferred && preferred !== issue);
}

function isRedundantTerminologyCodeInvalidIssue(
  issue: ValidationIssue,
  preferredIssues: Map<string, ValidationIssue>,
): boolean {
  const key = getTerminologyCodeInvalidKey(issue);
  if (!key) return false;
  const preferred = preferredIssues.get(key);
  return Boolean(preferred && preferred !== issue);
}

function isSpecificRequiredElementMissingIssue(issue: ValidationIssue): boolean {
  return issue.code === 'questionnaire-missing-status' || issue.code === 'qr-missing-status';
}

function isRedundantGenericMustSupportIssue(
  issue: ValidationIssue,
  sliceSpecificMustSupportPaths: Set<string>,
): boolean {
  if (sliceSpecificMustSupportPaths.size === 0) return false;
  if (issue.code !== 'profile-mustsupport-missing') return false;
  if (isSliceSpecificMustSupportIssue(issue)) return false;
  return sliceSpecificMustSupportPaths.has(getScopedMustSupportPath(issue));
}

function isRedundantCardinalityMinIssue(issue: ValidationIssue, specificRequiredElementPaths: Set<string>): boolean {
  if (specificRequiredElementPaths.size === 0) return false;
  if (issue.code !== 'structural-cardinality-min') return false;
  return specificRequiredElementPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantQuestionnaireAnswerOptionValueCardinalityIssue(
  issue: ValidationIssue,
  disallowedAnswerOptionPaths: Set<string>,
): boolean {
  if (disallowedAnswerOptionPaths.size === 0) return false;
  if (issue.code !== 'structural-cardinality-min') return false;

  const path = normalizeQuestionnairePathWithIndices(issue);
  const match = path.match(/^(.*)\.answeroption\[\d+\]\.value\[x\]$/);
  return Boolean(match?.[1] && disallowedAnswerOptionPaths.has(match[1]));
}

function isRedundantProfileMissingSystemIssue(issue: ValidationIssue, terminologyMissingSystemPaths: Set<string>): boolean {
  if (terminologyMissingSystemPaths.size === 0) return false;
  if (issue.aspect !== 'profile' || issue.code !== 'terminology-coding-missing-system') return false;
  return terminologyMissingSystemPaths.has(normalizeIssuePathForDedupe(issue));
}

function isRedundantMetadataTagCodeWithoutSystemIssue(issue: ValidationIssue, terminologyMissingSystemPaths: Set<string>): boolean {
  if (terminologyMissingSystemPaths.size === 0) return false;
  if (issue.code !== 'metadata-tag-code-without-system') return false;
  return terminologyMissingSystemPaths.has(normalizeIssuePathForDedupe(issue));
}

function isRedundantReferenceTypeMismatchIssue(issue: ValidationIssue, structuralReferenceTargetValues: Set<string>): boolean {
  if (structuralReferenceTargetValues.size === 0) return false;
  if (issue.code !== 'reference-type-mismatch') return false;
  const reference = getIssueReferenceValue(issue);
  return Boolean(reference && structuralReferenceTargetValues.has(reference));
}

function isRedundantBundleRequestRequiredElementIssue(issue: ValidationIssue, bundleRequestMissingUrlPaths: Set<string>): boolean {
  if (bundleRequestMissingUrlPaths.size === 0) return false;
  if (issue.code !== 'structural-required-element-missing') return false;
  return bundleRequestMissingUrlPaths.has(normalizeBundleRequestPath(issue));
}

function isRedundantBundleReferenceIssue(issue: ValidationIssue, bundleCrossEntryReferenceKeys: Set<string>): boolean {
  if (bundleCrossEntryReferenceKeys.size === 0) return false;
  if (issue.code !== 'reference-bundle-unresolved') return false;
  const key = getBundleReferenceIssueKey(issue);
  return Boolean(key && bundleCrossEntryReferenceKeys.has(key));
}

function isRedundantGenericInvalidReferenceIssue(issue: ValidationIssue, structuralInvalidReferenceValues: Set<string>): boolean {
  if (structuralInvalidReferenceValues.size === 0) return false;
  if (issue.code !== 'invalid-reference-format') return false;
  const reference = getIssueReferenceValue(issue);
  return Boolean(reference && structuralInvalidReferenceValues.has(reference));
}

function isRedundantUnresolvedInvalidReferenceIssue(issue: ValidationIssue, structuralInvalidReferenceValues: Set<string>): boolean {
  if (structuralInvalidReferenceValues.size === 0) return false;
  if (issue.code !== 'reference-bundle-unresolved' && issue.code !== 'bundle-cross-entry-reference-missing') return false;
  const reference = getIssueReferenceValue(issue);
  return Boolean(reference && structuralInvalidReferenceValues.has(reference));
}

function isRedundantNarrativeRequiredElementIssue(issue: ValidationIssue, narrativeMissingDivPaths: Set<string>): boolean {
  if (narrativeMissingDivPaths.size === 0) return false;
  if (issue.code !== 'structural-required-element-missing') return false;
  return narrativeMissingDivPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantDom6Issue(issue: ValidationIssue, narrativeMissingDivTextPaths: Set<string>): boolean {
  if (narrativeMissingDivTextPaths.size === 0) return false;
  if (issue.code !== 'dom-6') return false;
  return narrativeMissingDivTextPaths.has(normalizeNarrativeTextPath(issue));
}

function isRedundantBestPracticePresenceIssue(issue: ValidationIssue, cardinalityMinPaths: Set<string>): boolean {
  if (cardinalityMinPaths.size === 0) return false;
  if (!issue.code?.startsWith('best-practice-')) return false;
  return cardinalityMinPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantRequiredBindingIssue(issue: ValidationIssue, cardinalityMinPaths: Set<string>): boolean {
  if (cardinalityMinPaths.size === 0) return false;
  if (issue.code !== 'binding-required-missing' && issue.code !== 'terminology-binding-missing') return false;
  return cardinalityMinPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantProfileExtensionCardinalityIssue(issue: ValidationIssue, profileExtensionMinPaths: Set<string>): boolean {
  if (profileExtensionMinPaths.size === 0) return false;
  if (issue.code !== 'structural-cardinality-min') return false;
  return profileExtensionMinPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantProfileSliceCardinalityIssue(issue: ValidationIssue, profileSliceMinPaths: Set<string>): boolean {
  if (profileSliceMinPaths.size === 0) return false;
  if (issue.code !== 'structural-cardinality-min') return false;
  return profileSliceMinPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantExtensionSliceMaxIssue(
  issue: ValidationIssue,
  extensionMaxKeys: Set<string>,
): boolean {
  if (issue.code !== 'profile-slice-max-cardinality') return false;
  const key = getExtensionMaxCardinalityKey(issue);
  return Boolean(key && extensionMaxKeys.has(key));
}

function getExtensionMaxCardinalityKey(issue: ValidationIssue): string | null {
  if (
    issue.code !== 'profile-extension-max-cardinality' &&
    issue.code !== 'profile-slice-max-cardinality'
  ) return null;

  const details = issue.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  const rawName = issue.code === 'profile-extension-max-cardinality'
    ? record.url
    : record.sliceName ?? record.slice;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) return null;
  const normalizedName = rawName.split('/').filter(Boolean).pop()?.toLowerCase();
  if (!normalizedName) return null;

  const max = record.max;
  const found = record.found ?? record.actual;
  return [
    normalizeRequiredElementPath(issue),
    normalizedName,
    String(max ?? ''),
    String(found ?? ''),
  ].join('|');
}

function isRedundantMustSupportBestPracticeIssue(
  issue: ValidationIssue,
  mustSupportPaths: Set<string>,
): boolean {
  if (!issue.code?.startsWith('best-practice-')) return false;
  return mustSupportPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantReferenceFormatIssue(issue: ValidationIssue, ref1InvariantPaths: Set<string>): boolean {
  if (ref1InvariantPaths.size === 0) return false;
  if (issue.code !== 'reference-invalid-format') return false;
  return ref1InvariantPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantTerminologyNotFoundIssue(
  issue: ValidationIssue,
  invalidUriPaths: Set<string>,
  invalidTerminologySystemPaths: Set<string>,
): boolean {
  if (invalidUriPaths.size === 0 && invalidTerminologySystemPaths.size === 0) return false;
  if (issue.code !== 'not-found' && issue.code !== 'terminology-codesystem-unresolvable') return false;
  const path = normalizeRequiredElementPath(issue);
  return invalidUriPaths.has(path) || invalidTerminologySystemPaths.has(path);
}

function isTerminologySystemInvalidIssue(issue: ValidationIssue): boolean {
  if (issue.code !== 'terminology-code-invalid') return false;
  return normalizeRequiredElementPath(issue).endsWith('.system');
}

function isRedundantQuestionnaireReferenceWarning(
  issue: ValidationIssue,
  invalidQuestionnaireCanonicalReferences: Set<string>,
): boolean {
  if (invalidQuestionnaireCanonicalReferences.size === 0) return false;
  const key = getQuestionnaireReferenceWarningKey(issue);
  return Boolean(key && invalidQuestionnaireCanonicalReferences.has(key));
}

function isRedundantContainedUnreferencedIssue(issue: ValidationIssue, containedInvalidPaths: Set<string>): boolean {
  if (containedInvalidPaths.size === 0) return false;
  if (issue.code !== 'contained-unreferenced') return false;
  return containedInvalidPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantPresenceInvariantIssue(issue: ValidationIssue, requiredBindingViolationPaths: Set<string>): boolean {
  if (requiredBindingViolationPaths.size === 0) return false;
  if (issue.code !== 'ait-1-violation') return false;
  return requiredBindingViolationPaths.has(normalizeRequiredElementPath(issue));
}

function isRedundantExtensionConstraintIssue(issue: ValidationIssue, extensionNoValuePaths: Set<string>): boolean {
  if (extensionNoValuePaths.size === 0) return false;
  if (issue.code !== 'profile-constraint-violation') return false;
  const details = issue.details;
  const constraintKey = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).constraintKey
    : undefined;
  if (constraintKey !== 'ext-1') return false;
  return extensionNoValuePaths.has(normalizeRequiredElementPath(issue));
}

function isContainedUnreferencedInvalidIssue(issue: ValidationIssue): boolean {
  if (issue.code !== 'invalid') return false;
  const message = issue.message?.toLowerCase() ?? '';
  if (!message.includes('contained resource') || !message.includes('not referenced')) {
    return false;
  }
  return normalizeRequiredElementPath(issue).includes('contained');
}

function isRedundantProfileDom3Issue(issue: ValidationIssue, structuralDom3ContainedKeys: Set<string>): boolean {
  if (structuralDom3ContainedKeys.size === 0) return false;
  const key = getProfileDom3ContainedIssueKey(issue);
  return Boolean(key && structuralDom3ContainedKeys.has(key));
}

function getStructuralDom3ContainedIssueKey(issue: ValidationIssue): string | null {
  if (!isContainedUnreferencedInvalidIssue(issue)) return null;
  return getContainedUnreferencedIssueKey(issue);
}

function getProfileDom3ContainedIssueKey(issue: ValidationIssue): string | null {
  if (
    issue.code !== 'profile-constraint-violation' &&
    issue.code !== 'profile-constraint-warning'
  ) return null;
  const details = issue.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  if ((details as Record<string, unknown>).constraintKey !== 'dom-3') return null;
  return getContainedUnreferencedIssueKey(issue);
}

function getContainedUnreferencedIssueKey(issue: ValidationIssue): string | null {
  const containedId = getContainedResourceId(issue);
  if (!containedId) return null;
  return [
    getContainedIssueResourceScope(issue),
    normalizeContainedParentPath(issue),
    containedId.toLowerCase(),
  ].join(':');
}

function getContainedResourceId(issue: ValidationIssue): string | null {
  const details = issue.details;
  const detailContainedId = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).containedId
    : undefined;
  if (typeof detailContainedId === 'string' && detailContainedId.trim().length > 0) {
    return detailContainedId.trim();
  }

  const match = issue.message?.match(/contained resource ['"]([^'"]+)['"]/i);
  const containedId = match?.[1]?.trim();
  return containedId && containedId.length > 0 ? containedId : null;
}

function getContainedIssueResourceScope(issue: ValidationIssue): string {
  const details = issue.details;
  const detailRecord = details && typeof details === 'object' && !Array.isArray(details)
    ? details as Record<string, unknown>
    : undefined;
  const resourceType = typeof issue.resourceType === 'string'
    ? issue.resourceType
    : typeof detailRecord?.resourceType === 'string'
      ? detailRecord.resourceType
      : '';
  return resourceType.trim().toLowerCase();
}

function normalizeContainedParentPath(issue: ValidationIssue): string {
  return getIssuePath(issue)
    .trim()
    .replace(/\.contained(?:\[\d+\])?(?:\..*)?$/i, '')
    .replace(/\.$/, '')
    .toLowerCase();
}
