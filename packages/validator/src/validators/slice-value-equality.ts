export function valuesMatch(value1: unknown, value2: unknown): boolean {
  return valuesMatchInternal(value1, value2, new WeakMap<object, WeakSet<object>>());
}

function valuesMatchInternal(
  value1: unknown,
  value2: unknown,
  visitedPairs: WeakMap<object, WeakSet<object>>,
): boolean {
  if (value1 === null || value1 === undefined || value2 === null || value2 === undefined) {
    return value1 === value2;
  }

  if (!isObjectLike(value1) || !isObjectLike(value2)) {
    return value1 === value2;
  }

  if (Array.isArray(value1) || Array.isArray(value2)) {
    if (!Array.isArray(value1) || !Array.isArray(value2)) return false;
    if (value1.length !== value2.length) return false;
    if (hasVisitedPair(visitedPairs, value1, value2)) return true;
    markVisitedPair(visitedPairs, value1, value2);
    try {
      return value1.every((value, index) =>
        valuesMatchInternal(value, value2[index], visitedPairs)
      );
    } finally {
      visitedPairs.get(value1)?.delete(value2);
    }
  }

  if (hasVisitedPair(visitedPairs, value1, value2)) return true;
  markVisitedPair(visitedPairs, value1, value2);
  const keys1 = Object.keys(value1);
  const keys2 = Object.keys(value2);
  try {
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key =>
      valuesMatchInternal(value1[key], value2[key], visitedPairs)
    );
  } finally {
    visitedPairs.get(value1)?.delete(value2);
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
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
