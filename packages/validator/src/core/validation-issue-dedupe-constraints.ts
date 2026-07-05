import type { ValidationIssue } from '../types';
import { normalizeChoiceTypePath } from './choice-type-path';

export function isBundleDuplicateFullUrlIssue(issue: ValidationIssue): boolean {
  return issue.code === 'reference-bundle-duplicate-fullurl' ||
    issue.code === 'structural-bundle-fullurl-duplicate';
}

export function normalizeIssuePathForDedupe(issue: ValidationIssue): string {
  const path = issue.path || '';
  const details = issue.details;
  const detailsResourceType = details && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>).resourceType
    : undefined;
  const resourceType = typeof issue.resourceType === 'string'
    ? issue.resourceType
    : typeof detailsResourceType === 'string'
      ? detailsResourceType
      : undefined;

  if (!resourceType) return normalizeChoiceTypePath(path, { stripIndices: false });

  const prefix = `${resourceType}.`.toLowerCase();
  const lowerPath = path.toLowerCase();
  if (lowerPath === resourceType.toLowerCase()) return '';
  const relativePath = lowerPath.startsWith(prefix) ? path.slice(prefix.length) : path;
  return normalizeChoiceTypePath(relativePath, { stripIndices: false });
}

export function getConstraintDedupeKeys(issue: ValidationIssue, constraintKey: string): string[] {
  return getConstraintPathHierarchy(normalizeIssuePathForDedupe(issue))
    .map(path => `${path}:${constraintKey.toLowerCase()}`);
}

function getConstraintPathHierarchy(path: string): string[] {
  const normalized = path
    .trim()
    .toLowerCase()
    .replace(/\[\d+\]/g, '')
    .replace(/\.$/, '');
  const paths = [normalized];

  let current = normalized;
  while (current.includes('.')) {
    current = current.slice(0, current.lastIndexOf('.')).replace(/\.$/, '');
    paths.push(current);
    if (isBundleEntryResourceRoot(current)) {
      return paths;
    }
  }

  if (!isBundleEntryResourcePath(normalized) && !paths.includes('')) {
    paths.push('');
  }

  return paths;
}

function isBundleEntryResourcePath(path: string): boolean {
  return path.startsWith('entry.resource/*');
}

function isBundleEntryResourceRoot(path: string): boolean {
  return isBundleEntryResourcePath(path) && path.endsWith('*/');
}
