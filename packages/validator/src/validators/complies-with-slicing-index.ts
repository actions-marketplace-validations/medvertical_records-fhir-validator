const PATTERN_PREFIX = 'pattern';
const FIXED_PREFIX = 'fixed';

type ElementRecord = Record<string, unknown>;

interface Discriminator {
  type?: string;
  path?: string;
}

export interface DiscriminatorValue {
  type: string;
  path: string;
  fhirType: string;
  value: string;
}

export interface SliceRecord {
  id: string;
  parentPath: string;
  sliceName: string;
  min?: number;
  discriminatorCount: number;
  discriminatorValues: DiscriminatorValue[];
}

export interface SlicingParent {
  parentPath: string;
  rules?: string;
  discriminators: Discriminator[];
  slices: SliceRecord[];
}

export function indexSlicingParents(elements: unknown): Map<string, SlicingParent> {
  const records = toElementRecords(elements);
  const parents = new Map<string, SlicingParent>();

  for (const element of records) {
    const parentPath = getNonEmptyString(element.path);
    const slicing = toRecord(element.slicing);
    if (!parentPath || !slicing || parents.has(parentPath)) continue;
    parents.set(parentPath, {
      parentPath,
      rules: getNonEmptyString(slicing.rules),
      discriminators: readDiscriminators(slicing.discriminator),
      slices: [],
    });
  }

  const seenSliceIds = new Set<string>();
  for (const element of records) {
    const id = getNonEmptyString(element.id);
    const parentPath = getNonEmptyString(element.path);
    const sliceName = getNonEmptyString(element.sliceName);
    if (!id || !parentPath || !sliceName || seenSliceIds.has(id)) continue;

    const parent = parents.get(parentPath);
    if (!parent) continue;
    seenSliceIds.add(id);
    parent.slices.push({
      id,
      parentPath,
      sliceName,
      min: typeof element.min === 'number' && Number.isFinite(element.min)
        ? element.min
        : undefined,
      discriminatorCount: parent.discriminators.length,
      discriminatorValues: extractDiscriminatorValues(
        element,
        records,
        parent.discriminators,
      ),
    });
  }

  return parents;
}

function extractDiscriminatorValues(
  sliceElement: ElementRecord,
  allElements: ElementRecord[],
  discriminators: Discriminator[],
): DiscriminatorValue[] {
  return discriminators.flatMap(discriminator => {
    const value = readDiscriminatorValue(sliceElement, allElements, discriminator);
    return value ? [value] : [];
  });
}

function readDiscriminatorValue(
  sliceElement: ElementRecord,
  allElements: ElementRecord[],
  discriminator: Discriminator,
): DiscriminatorValue | null {
  const type = discriminator.type ?? 'value';
  const path = discriminator.path ?? '';
  if (!path) return null;

  const target = findDiscriminatorTarget(sliceElement, allElements, path);
  if (type === 'exists') {
    return readExistsDiscriminator(target, type, path);
  }
  if (type === 'type') {
    return readTypeDiscriminator(target, type, path);
  }
  if (type === 'profile') {
    return readProfileDiscriminator(target, type, path);
  }

  const inline = readFixedOrPatternValue(sliceElement, path, true);
  if (inline) return { type, path, ...inline };
  const child = target === sliceElement
    ? null
    : readFixedOrPatternValue(target, path, false);
  return child ? { type, path, ...child } : null;
}

function findDiscriminatorTarget(
  sliceElement: ElementRecord,
  allElements: ElementRecord[],
  path: string,
): ElementRecord {
  if (path === '$this') return sliceElement;
  const sliceId = getNonEmptyString(sliceElement.id);
  if (!sliceId) return sliceElement;
  const normalizedPath = path.startsWith('$this.') ? path.slice(6) : path;
  const childId = `${sliceId}.${normalizedPath}`;
  return allElements.find(element => element.id === childId) ?? sliceElement;
}

function readFixedOrPatternValue(
  element: ElementRecord,
  path: string,
  pluckInlinePath: boolean,
): Pick<DiscriminatorValue, 'fhirType' | 'value'> | null {
  for (const [key, rawConstraint] of Object.entries(element)) {
    const prefix = key.startsWith(PATTERN_PREFIX)
      ? PATTERN_PREFIX
      : key.startsWith(FIXED_PREFIX) ? FIXED_PREFIX : undefined;
    if (!prefix) continue;

    const raw = pluckInlinePath
      ? pluckPath(rawConstraint, path)
      : rawConstraint;
    const value = serializeDiscriminatorValue(raw);
    if (value === undefined) continue;
    return {
      fhirType: capitalize(key.slice(prefix.length)),
      value,
    };
  }
  return null;
}

function readExistsDiscriminator(
  element: ElementRecord,
  type: string,
  path: string,
): DiscriminatorValue | null {
  const exists = element.max === '0'
    ? false
    : typeof element.min === 'number' && element.min > 0 ? true : undefined;
  return exists === undefined
    ? null
    : { type, path, fhirType: 'Boolean', value: String(exists) };
}

function readTypeDiscriminator(
  element: ElementRecord,
  type: string,
  path: string,
): DiscriminatorValue | null {
  const codes = readTypeRecords(element)
    .flatMap(record => {
      const code = getNonEmptyString(record.code);
      return code ? [code] : [];
    })
    .sort();
  return codes.length === 0
    ? null
    : { type, path, fhirType: 'Code', value: codes.join(',') };
}

function readProfileDiscriminator(
  element: ElementRecord,
  type: string,
  path: string,
): DiscriminatorValue | null {
  const profiles = readTypeRecords(element)
    .flatMap(record => [
      ...readStringArray(record.profile),
      ...readStringArray(record.targetProfile),
    ])
    .map(stripCanonicalVersion)
    .sort();
  return profiles.length === 0
    ? null
    : { type, path, fhirType: 'Canonical', value: profiles.join(',') };
}

function pluckPath(value: unknown, path: string): unknown {
  const normalized = path === '$this'
    ? ''
    : path.startsWith('$this.') ? path.slice(6) : path;
  if (!normalized) return value;

  let current: unknown[] = [value];
  for (const part of normalized.split('.').filter(Boolean)) {
    current = current.flatMap(candidate => {
      if (Array.isArray(candidate)) {
        return candidate.flatMap(item => {
          const record = toRecord(item);
          return record && part in record ? [record[part]] : [];
        });
      }
      const record = toRecord(candidate);
      return record && part in record ? [record[part]] : [];
    });
    if (current.length === 0) return undefined;
  }
  const flattened = current.flatMap(candidate =>
    Array.isArray(candidate) ? candidate : [candidate]
  );
  return flattened.length === 1 ? flattened[0] : flattened;
}

function serializeDiscriminatorValue(value: unknown): string | undefined {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(sortJsonValue(value, new WeakSet<object>()));
  } catch {
    return undefined;
  }
}

function sortJsonValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Cyclic discriminator value');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => sortJsonValue(item, ancestors));
    }
    const record = value as ElementRecord;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, sortJsonValue(record[key], ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

function readDiscriminators(value: unknown): Discriminator[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    const record = toRecord(candidate);
    if (!record) return [];
    const path = getNonEmptyString(record.path);
    if (!path) return [];
    return [{
      type: getNonEmptyString(record.type),
      path,
    }];
  });
}

function readTypeRecords(element: ElementRecord): ElementRecord[] {
  return Array.isArray(element.type)
    ? element.type.flatMap(candidate => {
      const record = toRecord(candidate);
      return record ? [record] : [];
    })
    : [];
}

function readStringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.length > 0,
  );
}

function stripCanonicalVersion(value: string): string {
  return value.split('|')[0];
}

function toElementRecords(elements: unknown): ElementRecord[] {
  if (!Array.isArray(elements)) return [];
  return elements.flatMap(element => {
    const record = toRecord(element);
    return record ? [record] : [];
  });
}

function toRecord(value: unknown): ElementRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ElementRecord
    : undefined;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function capitalize(value: string): string {
  return value.length > 0
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value;
}
