export function normalizeFhirReferenceKey(reference: string): string | null {
  if (!reference || reference.startsWith('#')) return null;

  const path = extractReferencePath(reference);
  if (!path) return null;

  const segments = path
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const historyIndex = segments.indexOf('_history');
  if (historyIndex >= 2) {
    return `${segments[historyIndex - 2]}/${segments[historyIndex - 1]}`;
  }

  return `${segments[segments.length - 2]}/${segments[segments.length - 1]}`;
}

function extractReferencePath(reference: string): string | null {
  try {
    if (/^https?:\/\//i.test(reference)) {
      return new URL(reference).pathname;
    }
  } catch {
    return null;
  }

  const withoutQuery = reference.split('?')[0]?.split('#')[0] ?? '';
  return withoutQuery || null;
}
