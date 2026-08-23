const CODE_SYSTEM_CANONICAL_ALIASES: ReadonlyMap<string, string> = new Map([
  [
    'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/CodeSystem/mii-cs-therapie-stellungzurop',
    'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/CodeSystem/mii-cs-onko-therapie-stellungzurop',
  ],
]);

/**
 * Resolve published predecessor canonicals whose replacement preserves the
 * CodeSystem semantics and code namespace.
 */
export function normalizeKnownCodeSystemCanonical(systemUrl: string): string {
  const [canonical] = systemUrl.split('|');
  return CODE_SYSTEM_CANONICAL_ALIASES.get(canonical) ?? canonical;
}

export function codeSystemCanonicalsEquivalent(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) return false;
  return normalizeKnownCodeSystemCanonical(left) === normalizeKnownCodeSystemCanonical(right);
}

export function codeSystemCanonicalCandidates(systemUrl: string): string[] {
  const normalized = normalizeKnownCodeSystemCanonical(systemUrl);
  return normalized === systemUrl ? [systemUrl] : [systemUrl, normalized];
}
