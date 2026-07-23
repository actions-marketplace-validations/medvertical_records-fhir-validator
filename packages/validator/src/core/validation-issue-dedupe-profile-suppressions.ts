import { getEffectiveIssueRuleId, getSpecificIssueRuleId } from '@records-fhir/validation-types';
import type { ValidationIssue } from '../types';
import {
  getConstraintDedupeKeys,
  normalizeIssuePathForDedupe,
} from './validation-issue-dedupe-constraints';
import { normalizeRequiredElementPath } from './validation-issue-dedupe-utils';

export function isStructuralDateTimeMissingTimezoneIssue(issue: ValidationIssue): boolean {
  if (issue.code !== 'invalid' || issue.aspect !== 'structural') return false;
  const details = issue.details;
  const expectedType = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).expectedType
    : undefined;
  if (expectedType !== 'dateTime' && expectedType !== 'instant') return false;
  const message = issue.message?.toLowerCase() ?? '';
  return message.includes('date has a time') && message.includes('timezone');
}

export function isSpecificNameInvariantIssue(issue: ValidationIssue): boolean {
  if (!issue.code?.startsWith('constraint-violation-') &&
      issue.code !== 'profile-constraint-warning' &&
      issue.code !== 'profile-constraint-violation') return false;
  return (issue.message?.toLowerCase() ?? '').includes('name should be usable as an identifier');
}

export function isRedundantNameInvariantIssue(
  issue: ValidationIssue,
  specificNameInvariantPaths: Set<string>,
): boolean {
  return specificNameInvariantPaths.size > 0 &&
    isGenericNameInvariantIssue(issue) &&
    specificNameInvariantPaths.has(normalizeRequiredElementPath(issue));
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

export function isGermanGenderExtensionMissingIssue(issue: ValidationIssue): boolean {
  if (issue.code !== 'profile-extension-missing') return false;
  const details = issue.details;
  return Boolean(details && typeof details === 'object' && !Array.isArray(details) &&
    (details as Record<string, unknown>).expectedExtension === 'http://fhir.de/StructureDefinition/gender-amtlich-de');
}

export function isMiiGenderConstraintIssue(issue: ValidationIssue): boolean {
  if (issue.code === 'constraint-violation-mii-pat-1') return true;
  const details = issue.details;
  return issue.code === 'profile-constraint-violation' && Boolean(
    details && typeof details === 'object' && !Array.isArray(details) &&
    (details as Record<string, unknown>).constraintKey === 'mii-pat-1'
  );
}

export function getSpecificConstraintKey(issue: ValidationIssue): string | null {
  return getSpecificIssueRuleId(issue);
}

export function getEffectiveRuleId(issue: ValidationIssue): string | null {
  return getEffectiveIssueRuleId(issue);
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

export function isInvariantSpecificConstraintIssue(issue: ValidationIssue): boolean {
  return Boolean(issue.code?.trim().toLowerCase().match(/^(?:[a-z][a-z0-9]*-)+invariant-(.+)$/));
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
