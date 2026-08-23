import { createHash } from 'node:crypto';

export interface PinnedCanonicalFingerprint {
  algorithm: 'sha256-sorted-canonical-v1';
  count: number;
  sha256: string;
}

export function resolvePinnedCanonical(
  pinnedCanonicals: Map<string, string> | null,
  url: string,
): string {
  return !url.includes('|') ? pinnedCanonicals?.get(url) ?? url : url;
}

/**
 * Produce a deterministic, non-clinical fingerprint of the exact canonical
 * resolution map used by the validator. The map itself can be very large, so
 * run evidence stores this digest together with the immutable package pins.
 */
export function fingerprintPinnedCanonicals(
  pinnedCanonicals: ReadonlyMap<string, string> | null,
): PinnedCanonicalFingerprint {
  const entries = [...(pinnedCanonicals?.entries() ?? [])]
    .map(([canonical, resolved]) => [canonical.trim(), resolved.trim()] as const)
    .filter(([canonical, resolved]) => canonical.length > 0 && resolved.length > 0)
    .sort(([leftCanonical, leftResolved], [rightCanonical, rightResolved]) =>
      leftCanonical.localeCompare(rightCanonical) || leftResolved.localeCompare(rightResolved));
  const digest = createHash('sha256');
  for (const [canonical, resolved] of entries) {
    digest.update(canonical);
    digest.update('\0');
    digest.update(resolved);
    digest.update('\n');
  }
  return {
    algorithm: 'sha256-sorted-canonical-v1',
    count: entries.length,
    sha256: digest.digest('hex'),
  };
}
