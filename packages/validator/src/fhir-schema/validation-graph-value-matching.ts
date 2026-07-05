const MII_ONKO_PREFIX = 'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/CodeSystem/';

const GRAPH_CANONICAL_ALIASES = new Map<string, string>([
  [`${MII_ONKO_PREFIX}mii-cs-onko-therapie-stellungzurop`, `${MII_ONKO_PREFIX}mii-cs-therapie-stellungzurop`],
]);

export function graphValuesMatch(value: unknown, expected: unknown): boolean {
  if (value === null || value === undefined || expected === null || expected === undefined) {
    return value === expected;
  }

  if (typeof value !== 'object' || typeof expected !== 'object') {
    return value === expected || graphCanonicalValuesMatch(value, expected);
  }

  if (Array.isArray(value) && Array.isArray(expected)) {
    if (value.length !== expected.length) return false;
    return value.every((item, index) => graphValuesMatch(item, expected[index]));
  }

  if (Array.isArray(value) || Array.isArray(expected)) {
    return false;
  }

  const actualRecord = value as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const actualKeys = Object.keys(actualRecord);
  const expectedKeys = Object.keys(expectedRecord);
  if (actualKeys.length !== expectedKeys.length) return false;
  return actualKeys.every(key => graphValuesMatch(actualRecord[key], expectedRecord[key]));
}

export function graphPatternMatches(value: unknown, pattern: unknown): boolean {
  if (pattern === null || pattern === undefined) return true;
  if (value === null || value === undefined) return false;
  if (typeof pattern !== 'object') return value === pattern || graphCanonicalValuesMatch(value, pattern);

  if (Array.isArray(pattern)) {
    const values = Array.isArray(value) ? value : [value];
    return pattern.every(patternItem => values.some(actualItem => graphPatternMatches(actualItem, patternItem)));
  }

  if (Array.isArray(value)) {
    return value.some(actualItem => graphPatternMatches(actualItem, pattern));
  }

  if (typeof value !== 'object') return false;
  const actualRecord = value as Record<string, unknown>;
  return Object.entries(pattern as Record<string, unknown>).every(([key, expected]) =>
    graphPatternMatches(actualRecord[key], expected)
  );
}

function graphCanonicalValuesMatch(value: unknown, expected: unknown): boolean {
  if (typeof value !== 'string' || typeof expected !== 'string') return false;
  return canonicalAliasKey(value) === canonicalAliasKey(expected);
}

function canonicalAliasKey(value: string): string {
  const base = value.split('|')[0];
  return GRAPH_CANONICAL_ALIASES.get(base) ?? value;
}
