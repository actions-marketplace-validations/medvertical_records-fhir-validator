import type { ValidationIssue } from '../types';

const EMBEDDED_METADATA_COMPLETENESS_CODES = new Set([
  'required-metadata-missing-lastUpdated',
  'required-metadata-missing-versionId',
]);

export function shouldSuppressBundleEntryIssue(issue: ValidationIssue): boolean {
  return issue.aspect === 'metadata' &&
    typeof issue.code === 'string' &&
    EMBEDDED_METADATA_COMPLETENESS_CODES.has(issue.code);
}
