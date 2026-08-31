import { createHash } from 'node:crypto';

/** Stable one-way correlation handle for a profile canonical. */
export function profileCanonicalMetadata(canonicalUrl: string, version?: string): {
  profileRef: string;
} {
  return { profileRef: fingerprint(`${canonicalUrl}|${version ?? ''}`) };
}

/** Stable one-way correlation handle for a resource without exposing its ID. */
export function operationalResourceReference(
  resourceType: string | undefined,
  id: string | undefined,
): { resourceRef: string } {
  return { resourceRef: fingerprint(`${resourceType ?? 'Unknown'}/${id ?? 'unknown'}`) };
}

/** Correlates terminology targets and codes without exporting clinical data. */
export function terminologyTargetMetadata(...parts: Array<string | undefined>): {
  terminologyRef: string;
} {
  return { terminologyRef: fingerprint(parts.map(part => part ?? '').join('|')) };
}

/** Generic one-way handle for attacker-controlled or tenant-specific values. */
export function sensitiveValueMetadata(...parts: Array<string | undefined>): {
  sensitiveRef: string;
} {
  return { sensitiveRef: fingerprint(parts.map(part => part ?? '').join('|')) };
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
