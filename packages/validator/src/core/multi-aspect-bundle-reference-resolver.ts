import type { ReferenceResolver } from '../validators/slicing-validator';

const bundleReferenceIndexCache = new WeakMap<Record<string, unknown>, BundleReferenceIndex>();

interface BundleReferenceIndex {
  fullUrl: Map<string, any>;
  relative: Map<string, any>;
  hasEntries: boolean;
}

export function createBundleReferenceResolver(
  bundle: Record<string, unknown> | undefined,
  rootResource: Record<string, unknown>,
): ReferenceResolver | null {
  const contained = Array.isArray((rootResource as any).contained)
    ? (rootResource as any).contained
    : [];
  const bundleIndex = bundle ? getBundleReferenceIndex(bundle) : null;

  if (contained.length === 0 && !bundleIndex?.hasEntries) return null;
  const containedById = contained.length > 0
    ? new Map(contained
      .filter((resource: any) => typeof resource?.id === 'string')
      .map((resource: any) => [resource.id, resource]))
    : null;

  return (reference: string) => {
    if (!reference) return null;

    if (reference.startsWith('#')) {
      const id = reference.slice(1);
      return containedById?.get(id) ?? null;
    }

    const relativeKey = normalizeReferenceKey(reference);

    return bundleIndex?.fullUrl.get(reference)
      ?? bundleIndex?.relative.get(reference)
      ?? (relativeKey ? bundleIndex?.relative.get(relativeKey) : null)
      ?? null;
  };
}

function getBundleReferenceIndex(bundle: Record<string, unknown>): BundleReferenceIndex {
  const cached = bundleReferenceIndexCache.get(bundle);
  if (cached) return cached;

  const fullUrl = new Map<string, any>();
  const relative = new Map<string, any>();
  const entries = Array.isArray((bundle as any).entry) ? (bundle as any).entry : [];

  for (const entry of entries) {
    const resource = entry?.resource;
    if (!resource || typeof resource !== 'object') continue;

    if (typeof entry.fullUrl === 'string' && !fullUrl.has(entry.fullUrl)) {
      fullUrl.set(entry.fullUrl, resource);
    }

    if (typeof resource.resourceType === 'string' && typeof resource.id === 'string') {
      const key = `${resource.resourceType}/${resource.id}`;
      if (!relative.has(key)) relative.set(key, resource);
    }
  }

  const index = { fullUrl, relative, hasEntries: fullUrl.size > 0 || relative.size > 0 };
  bundleReferenceIndexCache.set(bundle, index);
  return index;
}

function normalizeReferenceKey(reference: string): string | null {
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
