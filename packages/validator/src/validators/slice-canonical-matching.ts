export function splitCanonicalReference(value: unknown): { url: string; version?: string } | null {
  if (typeof value !== 'string') return null;

  const parts = value.split('|');
  if (parts.length > 2) return null;
  const [url, version] = parts;
  if (!url || !/^https?:\/\//.test(url)) return null;
  if (parts.length === 2 && !version) return null;

  return version ? { url, version } : { url };
}

export function canonicalBasesMatch(value1: unknown, value2: unknown): boolean {
  const first = splitCanonicalReference(value1);
  const second = splitCanonicalReference(value2);
  return Boolean(first && second && first.url === second.url);
}

export function canonicalValuesMatch(actualValue: unknown, expectedValue: unknown): boolean {
  const actual = splitCanonicalReference(actualValue);
  const expected = splitCanonicalReference(expectedValue);
  if (!actual || !expected || actual.url !== expected.url) return false;

  // An unversioned fixedCanonical accepts any declaration of the same
  // canonical. A versioned fixedCanonical still requires that version.
  return !expected.version || actual.version === expected.version;
}
