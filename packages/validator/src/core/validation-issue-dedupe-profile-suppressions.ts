import type { ValidationIssue } from '../types';
import {
  getConstraintDedupeKeys,
  normalizeIssuePathForDedupe,
} from './validation-issue-dedupe-constraints';
import {
  getEffectiveRuleId,
  getSpecificConstraintKey,
} from './validation-issue-dedupe-profile-signals';
import { normalizeRequiredElementPath } from './validation-issue-dedupe-utils';

export function isRedundantNameInvariantIssue(
  issue: ValidationIssue,
  specificNameInvariantRulesByPath: Map<string, Set<string>>,
): boolean {
  if (!isGenericNameInvariantIssue(issue)) return false;
  const specificRules = specificNameInvariantRulesByPath.get(normalizeRequiredElementPath(issue));
  if (!specificRules || specificRules.size === 0) return false;

  // A specialised and a profile-derived diagnostic for the same invariant
  // must not suppress each other. In that case the invariant-specific
  // diagnostic wins via `profile-specific-over-invariant-specific`.
  // Only a genuinely resource-specific name rule (for example msd-0 over
  // generic cnl-0) suppresses the generic canonical-resource diagnostic.
  const genericRule = getEffectiveRuleId(issue) ?? '';
  return Array.from(specificRules).some(specificRule => specificRule !== genericRule);
}

function isGenericNameInvariantIssue(issue: ValidationIssue): boolean {
  const code = issue.code?.trim().toLowerCase();
  if (code === 'questionnaire-invariant-que-0') return true;
  return Boolean(code?.startsWith('canonical-resource-invariant-')) &&
    (issue.message?.toLowerCase() ?? '').includes('name should be usable as an identifier');
}

export function isRedundantQuestionnaireQue1bIssue(
  issue: ValidationIssue,
  questionnaireQue1Paths: Set<string>,
): boolean {
  return questionnaireQue1Paths.size > 0 &&
    issue.code === 'constraint-violation-que-1b' &&
    questionnaireQue1Paths.has(normalizeRequiredElementPath(issue));
}

export function isRedundantMetadataMissingTimezoneIssue(
  issue: ValidationIssue,
  structuralDateTimeMissingTimezonePaths: Set<string>,
): boolean {
  if (structuralDateTimeMissingTimezonePaths.size === 0 || issue.code !== 'metadata-last-updated-missing-timezone') return false;
  const path = normalizeIssuePathForDedupe(issue);
  const lowerPath = path.toLowerCase();
  return (lowerPath === 'meta.lastupdated' || lowerPath.endsWith('.meta.lastupdated')) &&
    structuralDateTimeMissingTimezonePaths.has(path);
}

export function isRedundantRequiredElementIssue(
  issue: ValidationIssue,
  cardinalityMinPaths: Set<string>,
): boolean {
  if (cardinalityMinPaths.size === 0) return false;
  if (!['structural-required-element-missing', 'required-element-missing', 'profile-mustsupport-missing'].includes(issue.code ?? '')) return false;
  return cardinalityMinPaths.has(normalizeRequiredElementPath(issue));
}

export function isRedundantBundleInvariantPresenceIssue(
  issue: ValidationIssue,
  bundleInvariantPresencePaths: Set<string>,
): boolean {
  if (bundleInvariantPresencePaths.size === 0) return false;
  if (![
    'structural-cardinality-min',
    'structural-required-element-missing',
    'required-element-missing',
    'profile-mustsupport-missing',
  ].includes(issue.code ?? '')) return false;
  return bundleInvariantPresencePaths.has(normalizeRequiredElementPath(issue));
}

export function isMiiGenderConstraintIssue(issue: ValidationIssue): boolean {
  if (issue.code === 'constraint-violation-mii-pat-1') return true;
  const details = issue.details;
  return issue.code === 'profile-constraint-violation' && Boolean(
    details && typeof details === 'object' && !Array.isArray(details) &&
    (details as Record<string, unknown>).constraintKey === 'mii-pat-1'
  );
}

export function isRedundantGenericConstraintIssue(issue: ValidationIssue, specificKeys: Set<string>): boolean {
  if (!['profile-constraint-violation', 'profile-constraint-warning'].includes(issue.code ?? '') || specificKeys.size === 0) return false;
  const details = issue.details;
  const constraintKey = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).constraintKey
    : undefined;
  return typeof constraintKey === 'string' && constraintKey.length > 0 &&
    getConstraintDedupeKeys(issue, constraintKey).some(key => specificKeys.has(key));
}

export function isRedundantProfileSpecificConstraintIssue(
  issue: ValidationIssue,
  invariantSpecificKeys: Set<string>,
): boolean {
  if (invariantSpecificKeys.size === 0 || !issue.code?.startsWith('constraint-violation-')) return false;
  const constraintKey = getSpecificConstraintKey(issue);
  return Boolean(constraintKey && getConstraintDedupeKeys(issue, constraintKey).some(key => invariantSpecificKeys.has(key)));
}

export function isRedundantBundleInvariantIssue(issue: ValidationIssue, specificKeys: Set<string>): boolean {
  if (!['profile-constraint-violation', 'profile-constraint-warning'].includes(issue.code ?? '') || specificKeys.size === 0) return false;
  const details = issue.details;
  const detailConstraint = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).constraintKey
    : undefined;
  const message = issue.message ?? '';
  const constraintKey = typeof detailConstraint === 'string'
    ? detailConstraint
    : message.includes("Constraint 'bdl-7'") ? 'bdl-7'
      : message.includes("Constraint 'bdl-9'") ? 'bdl-9'
        : message.includes("Constraint 'bdl-10'") ? 'bdl-10' : undefined;
  return Boolean(constraintKey && specificKeys.has(constraintKey));
}
