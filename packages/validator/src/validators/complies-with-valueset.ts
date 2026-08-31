type ObjectRecord = Record<string, unknown>;

export function resolveLocalValueSetCodes(
  valueSetRef: string,
  structureDefinition: unknown,
): Set<string> | null {
  const reference = valueSetRef.split('|')[0];
  const contained = isObjectRecord(structureDefinition) &&
    Array.isArray(structureDefinition.contained)
    ? structureDefinition.contained
    : [];
  const valueSet = contained.find(item =>
    isObjectRecord(item) &&
    item.resourceType === 'ValueSet' && (
      (reference.startsWith('#') && item.id === reference.slice(1)) ||
      item.url === reference
    )
  );
  return isObjectRecord(valueSet) ? extractSimpleValueSetCodes(valueSet) : null;
}

function extractSimpleValueSetCodes(valueSet: ObjectRecord): Set<string> | null {
  const codes = new Set<string>();
  const add = (system: string | undefined, code: string | undefined): void => {
    if (!code) return;
    codes.add(system ? `${system}|${code}` : code);
  };

  const expansion = isObjectRecord(valueSet.expansion) ? valueSet.expansion : null;
  if (expansion && Array.isArray(expansion.contains)) {
    const pending = [...expansion.contains];
    const visited = new WeakSet<object>();
    while (pending.length > 0) {
      const item = pending.pop();
      if (!isObjectRecord(item) || visited.has(item)) continue;
      visited.add(item);
      add(asString(item.system), asString(item.code));
      if (Array.isArray(item.contains)) pending.push(...item.contains);
    }
  }

  const compose = isObjectRecord(valueSet.compose) ? valueSet.compose : null;
  const includes = compose && Array.isArray(compose.include) ? compose.include : [];
  for (const include of includes) {
    if (!isObjectRecord(include)) return null;
    if (Array.isArray(include.filter) && include.filter.length > 0) return null;
    if (Array.isArray(include.valueSet) && include.valueSet.length > 0) return null;
    if (!Array.isArray(include.concept)) return null;
    for (const concept of include.concept) {
      if (isObjectRecord(concept)) {
        add(asString(include.system), asString(concept.code));
      }
    }
  }

  return codes.size > 0 ? codes : null;
}

export function formatCodeList(codes: string[]): string {
  return codes
    .map(code => code.includes('|') ? code.split('|').slice(1).join('|') : code)
    .sort()
    .join(', ');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isObjectRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
