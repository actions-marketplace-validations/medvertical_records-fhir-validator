export function getBundleEntries(bundle: Record<string, unknown>): unknown[] {
  return Array.isArray(bundle.entry) ? bundle.entry : [];
}

export function toBundleRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function displayValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
