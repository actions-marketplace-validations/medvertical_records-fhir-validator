export interface ProvenanceResource {
  resourceType: 'Provenance';
  id?: unknown;
  target?: unknown;
  recorded?: unknown;
  agent?: unknown;
  occurredDateTime?: unknown;
  occurredPeriod?: unknown;
}

export function isProvenance(resource: unknown): resource is ProvenanceResource {
  return typeof resource === 'object'
    && resource !== null
    && (resource as { resourceType?: unknown }).resourceType === 'Provenance';
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
