import type { ValidationIssue } from '../types';
import { normalizeChoiceTypePath } from './choice-type-path';

export function getTerminologyDisplayMismatchKey(issue: ValidationIssue): string | null {
  if (issue.code !== 'terminology-display-mismatch') return null;
  const details = getDetailsRecord(issue);
  const system = typeof details?.system === 'string' ? details.system.trim().toLowerCase() : '';
  const code = typeof details?.code === 'string' ? details.code.trim().toLowerCase() : '';
  const display = typeof details?.display === 'string' ? details.display.trim().toLowerCase() : '';
  if (!system || !code || !display) return null;
  return [
    getIssueResourceType(issue).toLowerCase(),
    normalizeDisplayMismatchPath(issue),
    system,
    code,
    display,
  ].join(':');
}

export function getTerminologyCodeInvalidKey(issue: ValidationIssue): string | null {
  if (
    issue.code !== 'terminology-code-invalid' &&
    issue.code !== 'invalid-code' &&
    issue.code !== 'tx-codesystem-concept-property-code-invalid'
  ) return null;
  const details = getDetailsRecord(issue);
  const system = typeof details?.system === 'string' ? details.system.trim().toLowerCase() : '';
  const code = typeof details?.code === 'string' ? details.code.trim().toLowerCase() : '';
  if (!system || !code) return null;
  const normalizedPath = normalizeIssuePathForTerminologyCode(issue);
  return [normalizedPath, system, code].join(':');
}

export function compareTerminologyCodeInvalidSpecificity(
  candidate: ValidationIssue,
  existing: ValidationIssue,
): number {
  const candidateScore = getTerminologyCodeInvalidSpecificity(candidate);
  const existingScore = getTerminologyCodeInvalidSpecificity(existing);
  if (candidateScore !== existingScore) return candidateScore - existingScore;
  return candidate.message.length - existing.message.length;
}

function normalizeIssuePathForTerminologyCode(issue: ValidationIssue): string {
  const resourceType = getIssueResourceType(issue);
  const rawPath = getIssuePath(issue).trim().toLowerCase();
  const prefix = `${resourceType}.`.toLowerCase();
  const relativePath = resourceType && rawPath.startsWith(prefix)
    ? rawPath.slice(prefix.length)
    : rawPath;
  const normalizedPath = normalizeChoiceTypePath(
    relativePath.replace(/\.value\.oftype\(([^)]+)\)/g, '.value$1'),
    { stripIndices: false },
  );
  if (normalizedPath.endsWith('.coding.code')) return normalizedPath.slice(0, -'.code'.length);
  if (normalizedPath.endsWith('.code')) return normalizedPath.slice(0, -'.code'.length);
  return normalizedPath;
}

function getTerminologyCodeInvalidSpecificity(issue: ValidationIssue): number {
  const details = getDetailsRecord(issue);
  let score = getSeverityRank(issue.severity) * 1_000;
  if (details?.loincCheckDigitStatus === 'invalid' || typeof details?.expectedCheckDigit === 'string') {
    score += 200;
  }
  if (issue.message.toLowerCase().includes('check digit')) score += 100;
  if (issue.code === 'terminology-code-invalid') score += 25;
  if (issue.code === 'tx-codesystem-concept-property-code-invalid') score += 100;
  if (details?.provenance && typeof details.provenance === 'object') score += 50;
  return score;
}

export function compareDisplayMismatchSpecificity(candidate: ValidationIssue, existing: ValidationIssue): number {
  const candidateScore = getDisplayMismatchSpecificity(candidate);
  const existingScore = getDisplayMismatchSpecificity(existing);
  if (candidateScore !== existingScore) return candidateScore - existingScore;
  return (getIssuePath(candidate) || '').length - (getIssuePath(existing) || '').length;
}

function getDisplayMismatchSpecificity(issue: ValidationIssue): number {
  const details = getDetailsRecord(issue);
  const sourceExecutor = details?.provenance && typeof details.provenance === 'object' && !Array.isArray(details.provenance)
    ? (details.provenance as Record<string, unknown>).sourceExecutor
    : undefined;
  return getSeverityRank(issue.severity) * 100 +
    (issue.aspect === 'profile' || sourceExecutor === 'profile' ? 20 : 0) +
    (normalizeRawDisplayMismatchPath(issue).endsWith('.display') ? 5 : 0);
}

export function getInvalidUriIssueKey(issue: ValidationIssue): string | null {
  if (issue.code !== 'structural-invalid-uri') return null;
  const details = getDetailsRecord(issue);
  const value = details?.value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return `${normalizeInvalidUriDedupePath(issue)}:${value.trim().toLowerCase()}`;
}

export function compareInvalidUriSpecificity(candidate: ValidationIssue, existing: ValidationIssue): number {
  const candidateScore = getInvalidUriSpecificity(candidate);
  const existingScore = getInvalidUriSpecificity(existing);
  if (candidateScore !== existingScore) return candidateScore - existingScore;
  return (candidate.path ?? '').length - (existing.path ?? '').length;
}

function getInvalidUriSpecificity(issue: ValidationIssue): number {
  const path = getIssuePath(issue);
  let score = 0;
  if (path.includes("[url='") || path.includes('[url="')) score += 100;
  if (issue.aspect === 'profile') score += 50;
  return score;
}

export function getDetailsRecord(issue: ValidationIssue): Record<string, unknown> | undefined {
  const details = issue.details;
  return details && typeof details === 'object' && !Array.isArray(details)
    ? details as Record<string, unknown>
    : undefined;
}

function getIssueResourceType(issue: ValidationIssue): string {
  const details = getDetailsRecord(issue);
  const detailResourceType = details?.resourceType;
  if (typeof issue.resourceType === 'string' && issue.resourceType.length > 0) {
    return issue.resourceType;
  }
  if (typeof detailResourceType === 'string' && detailResourceType.length > 0) {
    return detailResourceType;
  }
  const pathResourceType = getIssuePath(issue).trim().match(/^([A-Z][A-Za-z0-9]+)\./)?.[1];
  return pathResourceType ?? '';
}

function normalizeDisplayMismatchPath(issue: ValidationIssue): string {
  return normalizeRawDisplayMismatchPath(issue)
    .replace(/\.display$/i, '')
    .toLowerCase();
}

function normalizeRawDisplayMismatchPath(issue: ValidationIssue): string {
  const path = getIssuePath(issue).trim();
  const resourceType = getIssueResourceType(issue);
  const prefix = `${resourceType}.`;
  return resourceType && path.toLowerCase().startsWith(prefix.toLowerCase())
    ? path.slice(prefix.length)
    : path;
}

function getSeverityRank(severity: ValidationIssue['severity']): number {
  if (severity === 'fatal') return 4;
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

export function isSliceSpecificMustSupportIssue(issue: ValidationIssue): boolean {
  if (issue.code !== 'profile-mustsupport-missing') return false;
  const details = issue.details;
  const sliceName = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).sliceName
    : undefined;
  return (typeof sliceName === 'string' && sliceName.length > 0) || getIssuePath(issue).includes(':');
}

export function getScopedMustSupportPath(issue: ValidationIssue): string {
  return [
    getMustSupportResourceScope(issue),
    normalizeRequiredElementPath(issue),
  ].join(':');
}

function getMustSupportResourceScope(issue: ValidationIssue): string {
  const details = issue.details;
  const detailRecord = details && typeof details === 'object' && !Array.isArray(details)
    ? details as Record<string, unknown>
    : undefined;
  const bundleUnit = detailRecord?.bundleUnit && typeof detailRecord.bundleUnit === 'object' && !Array.isArray(detailRecord.bundleUnit)
    ? detailRecord.bundleUnit as Record<string, unknown>
    : undefined;
  const entryIndex = bundleUnit?.entryIndex;
  const resourceType = typeof issue.resourceType === 'string'
    ? issue.resourceType
    : typeof detailRecord?.resourceType === 'string'
      ? detailRecord.resourceType
      : typeof bundleUnit?.resourceType === 'string'
        ? bundleUnit.resourceType
        : '';
  const resourceId = typeof bundleUnit?.resourceId === 'string' ? bundleUnit.resourceId : '';
  const profile = typeof issue.profile === 'string'
    ? issue.profile
    : typeof detailRecord?.sourceProfile === 'string'
      ? detailRecord.sourceProfile
      : '';

  if (typeof entryIndex === 'number' || typeof entryIndex === 'string') {
    return `${profile}|entry:${entryIndex}|${resourceType}|${resourceId}`;
  }
  return `${profile}|${resourceType}|${resourceId}`;
}

export function normalizeRequiredElementPath(issue: ValidationIssue): string {
  const path = getIssuePath(issue);

  return normalizeChoiceTypePath(path
    .replace(/\[\d+\]/g, '')
    .replace(/:[^.]+/g, '')
    .replace(/^[A-Z][A-Za-z0-9]*\./, ''));
}

export function getQuestionnaireAnswerOptionDisallowedPath(issue: ValidationIssue): string | null {
  if (issue.code !== 'questionnaire-invariant-que-5') return null;
  const path = normalizeQuestionnairePathWithIndices(issue);
  return path.includes('.answeroption') ? null : path;
}

export function normalizeQuestionnairePathWithIndices(issue: ValidationIssue): string {
  return getIssuePath(issue)
    .trim()
    .replace(/^[A-Z][A-Za-z0-9]*\./, '')
    .replace(/:[^.]+/g, '')
    .replace(/\.+/g, '.')
    .replace(/\.$/, '')
    .toLowerCase();
}

function normalizeInvalidUriDedupePath(issue: ValidationIssue): string {
  return normalizeChoiceTypePath(getIssuePath(issue)
    .replace(/\[\d+\]/g, '')
    .replace(/\[(?!x\])[^\]]+\]/gi, '')
    .replace(/:[^.]+/g, '')
    .replace(/^[A-Z][A-Za-z0-9]*\./, '')
    .trim()
    .toLowerCase());
}

export function getInvalidQuestionnaireCanonicalReferenceKey(issue: ValidationIssue): string | null {
  if (issue.code !== 'structural-invalid-uri') return null;
  if (normalizeInvalidUriDedupePath(issue) !== 'questionnaire') return null;

  const details = issue.details;
  const value = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).value
    : undefined;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

export function getInvalidProfileCanonicalValue(issue: ValidationIssue): string | null {
  if (issue.code !== 'structural-invalid-uri') return null;
  if (normalizeInvalidUriDedupePath(issue) !== 'meta.profile') return null;

  const details = getDetailsRecord(issue);
  const value = details?.value;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

export function isRedundantProfileNotResolvedWarning(
  issue: ValidationIssue,
  invalidProfileCanonicalValues: Set<string>,
): boolean {
  if (issue.code !== 'profile-not-resolved') return false;
  if (invalidProfileCanonicalValues.size === 0) return false;

  const details = getDetailsRecord(issue);
  const profile = details?.profile;
  return typeof profile === 'string' && invalidProfileCanonicalValues.has(profile.trim().toLowerCase());
}

export function isRedundantMetadataProfileInvalidUrlIssue(
  issue: ValidationIssue,
  invalidProfileCanonicalValues: Set<string>,
): boolean {
  if (issue.code !== 'metadata-profile-invalid-url') return false;
  if (invalidProfileCanonicalValues.size === 0) return false;

  const details = getDetailsRecord(issue);
  const value = details?.value;
  return typeof value === 'string' && invalidProfileCanonicalValues.has(value.trim().toLowerCase());
}

export function getQuestionnaireReferenceWarningKey(issue: ValidationIssue): string | null {
  if (issue.code !== 'questionnaire-reference-not-resolved') return null;
  if (normalizeRequiredElementPath(issue) !== 'questionnaire') return null;

  const details = issue.details;
  const questionnaire = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).questionnaire
    : undefined;
  return typeof questionnaire === 'string' && questionnaire.trim().length > 0
    ? questionnaire.trim().toLowerCase()
    : null;
}

export function getIssuePath(issue: ValidationIssue): string {
  const details = issue.details;
  const detailPath = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).fieldPath ?? (details as Record<string, unknown>).element
    : undefined;
  return typeof detailPath === 'string' && detailPath.length > 0
    ? detailPath
    : issue.path ?? '';
}

export function normalizeNarrativeMissingDivPath(issue: ValidationIssue): string {
  const path = normalizeRequiredElementPath(issue);
  return path.endsWith('.div') ? path : `${path}.div`;
}

export function normalizeNarrativeTextPath(issue: ValidationIssue): string {
  const path = normalizeRequiredElementPath(issue);
  return path.endsWith('.div') ? path.slice(0, -'.div'.length) : path;
}

export function getIssueReferenceValue(issue: ValidationIssue): string | null {
  const details = issue.details;
  const reference = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).reference
    : undefined;
  return typeof reference === 'string' && reference.trim().length > 0
    ? reference.trim().toLowerCase()
    : null;
}

export function getBundleReferenceIssueKey(issue: ValidationIssue): string | null {
  const reference = getIssueReferenceValue(issue);
  if (!reference) return null;
  const path = getIssuePath(issue) || issue.path || '';
  const entryMatch = path.match(/Bundle\.entry\[(\d+)\]/i);
  if (!entryMatch) return null;
  return `${entryMatch[1]}:${reference}`;
}

export function normalizeBundleRequestPath(issue: ValidationIssue): string {
  const details = issue.details;
  const detailPath = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).fieldPath ?? (details as Record<string, unknown>).element
    : undefined;
  const path = typeof detailPath === 'string' && detailPath.length > 0
    ? detailPath
    : issue.path ?? '';
  return path
    .trim()
    .toLowerCase()
    .replace(/^bundle\./, '')
    .replace(/\.$/, '');
}
