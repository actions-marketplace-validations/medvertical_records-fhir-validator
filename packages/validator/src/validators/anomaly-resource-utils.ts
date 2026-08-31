export type FhirRecord = Record<string, unknown>;

export function toRecord(value: unknown): FhirRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as FhirRecord
    : undefined;
}

export function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getResourceType(value: unknown): string | undefined {
  return getString(toRecord(value)?.resourceType);
}

export function getResourceId(value: unknown, index: number): string {
  return getString(toRecord(value)?.id) ?? `[index ${index}]`;
}

export function getCodings(value: unknown): FhirRecord[] {
  const coding = toRecord(value)?.coding;
  if (!Array.isArray(coding)) return [];
  return coding.flatMap(candidate => {
    const record = toRecord(candidate);
    return record ? [record] : [];
  });
}

export function getPrimaryCode(resource: FhirRecord): string | undefined {
  for (const coding of getCodings(resource.code)) {
    const code = getString(coding.code);
    if (!code) continue;
    const system = getString(coding.system);
    return system ? `${system}|${code}` : code;
  }
  return getString(toRecord(resource.code)?.text);
}

export function getSubjectReference(resource: FhirRecord): string | undefined {
  return getString(toRecord(resource.subject)?.reference)
    ?? getString(toRecord(resource.patient)?.reference);
}

export function collectReferences(value: unknown): string[] {
  const references = new Set<string>();
  const pending: unknown[] = [value];
  const visited = new WeakSet<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    const record = current as FhirRecord;
    const reference = getString(record.reference);
    if (reference) references.add(reference);
    for (const [key, child] of Object.entries(record)) {
      if (key === 'resourceType' || key === 'id') continue;
      pending.push(child);
    }
  }

  return Array.from(references);
}
