export function extractPatternEntry(
  element: unknown,
): { key: string; value: unknown } | undefined {
  if (!isObjectRecord(element)) return undefined;
  if (element.pattern !== undefined) return { key: 'pattern', value: element.pattern };
  const key = Object.keys(element).find(k => k.startsWith('pattern') && k !== 'pattern');
  return key ? { key, value: element[key] } : undefined;
}

export function extractFixedEntry(
  element: unknown,
): { key: string; value: unknown } | undefined {
  if (!isObjectRecord(element)) return undefined;
  if (element.fixed !== undefined) return { key: 'fixed', value: element.fixed };
  const key = Object.keys(element).find(k => k.startsWith('fixed') && k !== 'fixed');
  return key ? { key, value: element[key] } : undefined;
}

export function extractFixedFromElement(element: unknown): unknown {
  const entry = extractFixedEntry(element);
  return entry?.value;
}

export function extractPatternFromElement(element: unknown): unknown {
  const entry = extractPatternEntry(element);
  return entry?.value;
}

export function extractFixedValue(elementDef: unknown): unknown {
  return extractFixedFromElement(elementDef);
}

export function extractPatternValue(elementDef: unknown): unknown {
  return extractPatternFromElement(elementDef);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
