/**
 * FHIR permits a contained resource to point back to its container with the
 * special bare `#` reference. Traverse iteratively so malformed cyclic input
 * cannot overflow the stack or loop forever.
 */
export function hasBareReferenceToContainer(value: unknown): boolean {
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

    for (const [key, child] of Object.entries(current)) {
      if (key === 'reference' && child === '#') return true;
      pending.push(child);
    }
  }

  return false;
}
