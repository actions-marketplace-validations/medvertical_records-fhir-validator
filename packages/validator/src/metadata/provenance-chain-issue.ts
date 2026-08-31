import type { ValidationIssue } from '../types';
import { createMetadataIssue } from './metadata-issue';
import type { ProvenanceResource } from './provenance-chain-types';

interface ProvenanceIssueInput {
  resource: ProvenanceResource;
  severity: 'error' | 'warning' | 'info';
  code: string;
  path: string;
  message: string;
  humanReadable?: string;
}

export function createProvenanceIssue({
  resource,
  severity,
  code,
  path,
  message,
  humanReadable,
}: ProvenanceIssueInput): ValidationIssue {
  const resourceId = typeof resource.id === 'string' && resource.id.length > 0
    ? resource.id
    : undefined;
  return createMetadataIssue({
    severity,
    code,
    message,
    path,
    humanReadable: humanReadable ?? message,
    resourceType: 'Provenance',
    validationMethod: 'provenance-chain-check',
    details: resourceId ? { resourceId } : {},
    schemaVersion: 'R4',
  });
}
