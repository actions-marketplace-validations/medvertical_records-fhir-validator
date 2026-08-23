export function codingMatchesBindingCodes(
  element: unknown,
  bindingCodes: Set<string>,
): boolean {
  return codingMatchesBindingCodesInternal(element, bindingCodes, new WeakSet<object>());
}

function codingMatchesBindingCodesInternal(
  element: unknown,
  bindingCodes: Set<string>,
  visited: WeakSet<object>,
): boolean {
  // A discriminator path ending at a repeating element (e.g. `systemType.coding`)
  // resolves to the raw Coding array; any repetition in the ValueSet selects
  // the slice, matching HL7 validator behaviour.
  if (Array.isArray(element)) {
    if (visited.has(element)) return false;
    visited.add(element);
    return element.some(item =>
      codingMatchesBindingCodesInternal(item, bindingCodes, visited)
    );
  }
  // Primitive `code` / `string` elements (e.g. Bundle.entry.request.method)
  // discriminate via their required binding when the slice carries no
  // fixed/pattern. The instance value has no system, so bare-code entries
  // match directly and system-qualified expansion entries match on the code
  // part — the binding itself implies the system.
  if (typeof element === 'string') {
    if (bindingCodes.has(element)) return true;
    for (const bindingCode of bindingCodes) {
      const separator = bindingCode.lastIndexOf('|');
      if (separator !== -1 && bindingCode.slice(separator + 1) === element) return true;
    }
    return false;
  }
  if (!isObjectRecord(element)) return false;
  if (visited.has(element)) return false;
  visited.add(element);
  if (Array.isArray(element.coding)) {
    return element.coding.some(coding =>
      codingMatchesBindingCodesInternal(coding, bindingCodes, visited)
    );
  }
  const { system, code } = element;
  if (typeof system === 'string' && typeof code === 'string') {
    if (bindingCodes.has(`${system}|${code}`)) return true;

    // ValueSet expansions in package files historically carried both
    // `system|code` and bare `code` entries. For a system-qualified Coding,
    // never let a bare duplicate from another CodeSystem select the slice.
    for (const bindingCode of bindingCodes) {
      if (bindingCode.includes('|')) return false;
    }

    return bindingCodes.has(code);
  }
  if (typeof code === 'string') return bindingCodes.has(code);
  return false;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
