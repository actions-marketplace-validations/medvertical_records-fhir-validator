export function matchesPattern(actualValue: unknown, patternValue: unknown): boolean {
  return matchesPatternInternal(
    actualValue,
    patternValue,
    new WeakMap<object, WeakSet<object>>(),
  );
}

function matchesPatternInternal(
  actualValue: unknown,
  patternValue: unknown,
  visitedPairs: WeakMap<object, WeakSet<object>>,
): boolean {
  if (patternValue === null || patternValue === undefined) return true;
  if (actualValue === null || actualValue === undefined) return false;
  if (typeof patternValue !== 'object') return actualValue === patternValue;

  if (Array.isArray(patternValue)) {
    const actualList = Array.isArray(actualValue) ? actualValue : [actualValue];
    return patternValue.every(patternItem =>
      actualList.some(actualItem =>
        matchesPatternInternal(actualItem, patternItem, visitedPairs)
      )
    );
  }

  // When pattern is a single object against an array, the object must match
  // *some* array element — otherwise sliced 0..* elements would always drop.
  if (Array.isArray(actualValue)) {
    return actualValue.some(actualItem =>
      matchesPatternInternal(actualItem, patternValue, visitedPairs)
    );
  }

  if (!isObjectRecord(actualValue) || !isObjectRecord(patternValue)) return false;
  if (hasVisitedPair(visitedPairs, patternValue, actualValue)) return true;
  markVisitedPair(visitedPairs, patternValue, actualValue);
  try {
    for (const key of Object.keys(patternValue)) {
      if (!matchesPatternInternal(actualValue[key], patternValue[key], visitedPairs)) {
        return false;
      }
    }
    return true;
  } finally {
    visitedPairs.get(patternValue)?.delete(actualValue);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasVisitedPair(
  visitedPairs: WeakMap<object, WeakSet<object>>,
  first: object,
  second: object,
): boolean {
  return visitedPairs.get(first)?.has(second) ?? false;
}

function markVisitedPair(
  visitedPairs: WeakMap<object, WeakSet<object>>,
  first: object,
  second: object,
): void {
  const seconds = visitedPairs.get(first) ?? new WeakSet<object>();
  seconds.add(second);
  visitedPairs.set(first, seconds);
}
