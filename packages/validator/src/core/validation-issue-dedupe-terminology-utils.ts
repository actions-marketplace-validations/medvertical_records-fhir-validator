import type { ValidationIssue } from '../types';
import { normalizeChoiceTypePath } from './choice-type-path';
import {
  getDetailsRecord,
  getIssuePath,
  getIssueResourceType,
} from './validation-issue-dedupe-common';
import { normalizeInvalidUriDedupePath } from './validation-issue-dedupe-path-utils';

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
    issue.code !== 'terminology-code-invalid'
    && issue.code !== 'invalid-code'
    && issue.code !== 'tx-codesystem-concept-property-code-invalid'
  ) return null;
  const details = getDetailsRecord(issue);
  const system = typeof details?.system === 'string' ? details.system.trim().toLowerCase() : '';
  const code = typeof details?.code === 'string' ? details.code.trim().toLowerCase() : '';
  if (!system || !code) return null;
  return [normalizeIssuePathForTerminologyCode(issue), system, code].join(':');
}

export function compareTerminologyCodeInvalidSpecificity(
  candidate: ValidationIssue,
  existing: ValidationIssue,
): number {
  const scoreDifference = getTerminologyCodeInvalidSpecificity(candidate)
    - getTerminologyCodeInvalidSpecificity(existing);
  return scoreDifference || candidate.message.length - existing.message.length;
}

export function compareDisplayMismatchSpecificity(
  candidate: ValidationIssue,
  existing: ValidationIssue,
): number {
  const scoreDifference = getDisplayMismatchSpecificity(candidate)
    - getDisplayMismatchSpecificity(existing);
  return scoreDifference || getIssuePath(candidate).length - getIssuePath(existing).length;
}

export function getInvalidUriIssueKey(issue: ValidationIssue): string | null {
  if (issue.code !== 'structural-invalid-uri') return null;
  const value = getDetailsRecord(issue)?.value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return `${normalizeInvalidUriDedupePath(issue)}:${value.trim().toLowerCase()}`;
}

export function compareInvalidUriSpecificity(
  candidate: ValidationIssue,
  existing: ValidationIssue,
): number {
  const scoreDifference = getInvalidUriSpecificity(candidate) - getInvalidUriSpecificity(existing);
  return scoreDifference || (candidate.path ?? '').length - (existing.path ?? '').length;
}

function normalizeIssuePathForTerminologyCode(issue: ValidationIssue): string {
  const resourceType = getIssueResourceType(issue);
  const rawPath = getIssuePath(issue).trim().toLowerCase();
  const prefix = `${resourceType}.`.toLowerCase();
  const relativePath = resourceType && rawPath.startsWith(prefix) ? rawPath.slice(prefix.length) : rawPath;
  const normalized = normalizeChoiceTypePath(
    relativePath.replace(/\.value\.oftype\(([^)]+)\)/g, '.value$1'),
    { stripIndices: false },
  );
  return normalized.endsWith('.code') ? normalized.slice(0, -'.code'.length) : normalized;
}

function getTerminologyCodeInvalidSpecificity(issue: ValidationIssue): number {
  const details = getDetailsRecord(issue);
  let score = getSeverityRank(issue.severity) * 1_000;
  if (details?.loincCheckDigitStatus === 'invalid' || typeof details?.expectedCheckDigit === 'string') score += 200;
  if (issue.message.toLowerCase().includes('check digit')) score += 100;
  if (issue.code === 'terminology-code-invalid') score += 25;
  if (issue.code === 'tx-codesystem-concept-property-code-invalid') score += 100;
  if (details?.provenance && typeof details.provenance === 'object') score += 50;
  return score;
}

function getDisplayMismatchSpecificity(issue: ValidationIssue): number {
  const provenance = getDetailsRecord(issue)?.provenance;
  const sourceExecutor = provenance && typeof provenance === 'object' && !Array.isArray(provenance)
    ? (provenance as Record<string, unknown>).sourceExecutor
    : undefined;
  return getSeverityRank(issue.severity) * 100
    + (issue.aspect === 'profile' || sourceExecutor === 'profile' ? 20 : 0)
    + (normalizeRawDisplayMismatchPath(issue).endsWith('.display') ? 5 : 0);
}

function normalizeDisplayMismatchPath(issue: ValidationIssue): string {
  return normalizeRawDisplayMismatchPath(issue).replace(/\.display$/i, '').toLowerCase();
}

function normalizeRawDisplayMismatchPath(issue: ValidationIssue): string {
  const path = getIssuePath(issue).trim();
  const resourceType = getIssueResourceType(issue);
  const prefix = `${resourceType}.`;
  return resourceType && path.toLowerCase().startsWith(prefix.toLowerCase())
    ? path.slice(prefix.length)
    : path;
}

function getInvalidUriSpecificity(issue: ValidationIssue): number {
  const path = getIssuePath(issue);
  return (path.includes("[url='") || path.includes('[url="') ? 100 : 0)
    + (issue.aspect === 'profile' ? 50 : 0);
}

function getSeverityRank(severity: ValidationIssue['severity']): number {
  if (severity === 'fatal') return 4;
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
