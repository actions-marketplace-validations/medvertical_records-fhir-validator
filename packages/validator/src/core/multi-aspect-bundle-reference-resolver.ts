import type { ReferenceResolver } from '../validators/slicing-validator';
import { normalizeFhirReferenceKey } from './fhir-reference-key';

type FhirResource = Record<string, unknown>;

interface BundleReferenceIndex {
  fullUrl: Map<string, FhirResource>;
  relative: Map<string, FhirResource>;
  hasEntries: boolean;
}

export class BundleReferenceIndexCache {
  private readonly indexes = new WeakMap<Record<string, unknown>, BundleReferenceIndex>();

  get(bundle: Record<string, unknown>): BundleReferenceIndex {
    const cached = this.indexes.get(bundle);
    if (cached) return cached;
    const index = buildBundleReferenceIndex(bundle);
    this.indexes.set(bundle, index);
    return index;
  }
}

export function createBundleReferenceResolver(
  bundle: Record<string, unknown> | undefined,
  rootResource: Record<string, unknown>,
  indexCache: BundleReferenceIndexCache = new BundleReferenceIndexCache(),
): ReferenceResolver | null {
  const contained = Array.isArray(rootResource.contained)
    ? rootResource.contained
    : [];
  const bundleIndex = bundle ? indexCache.get(bundle) : null;

  if (contained.length === 0 && !bundleIndex?.hasEntries) return null;
  const containedById = contained.length > 0
    ? new Map<string, FhirResource>(contained
      .filter((resource): resource is FhirResource =>
        isObjectRecord(resource) && typeof resource.id === 'string'
      )
      .map(resource => [resource.id as string, resource]))
    : null;

  return (reference: string) => {
    if (!reference) return null;

    if (reference.startsWith('#')) {
      const id = reference.slice(1);
      if (id.length === 0) return rootResource;
      return containedById?.get(id) ?? null;
    }

    const relativeKey = normalizeFhirReferenceKey(reference);

    return bundleIndex?.fullUrl.get(reference)
      ?? bundleIndex?.relative.get(reference)
      ?? (relativeKey ? bundleIndex?.relative.get(relativeKey) : null)
      ?? null;
  };
}

function buildBundleReferenceIndex(bundle: Record<string, unknown>): BundleReferenceIndex {
  const fullUrl = new Map<string, FhirResource>();
  const relative = new Map<string, FhirResource>();
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];

  for (const entry of entries) {
    if (!isObjectRecord(entry) || !isObjectRecord(entry.resource)) continue;
    const resource = entry.resource;

    if (typeof entry.fullUrl === 'string' && !fullUrl.has(entry.fullUrl)) {
      fullUrl.set(entry.fullUrl, resource);
    }

    if (typeof resource.resourceType === 'string' && typeof resource.id === 'string') {
      const key = `${resource.resourceType}/${resource.id}`;
      if (!relative.has(key)) relative.set(key, resource);
    }
  }

  return { fullUrl, relative, hasEntries: fullUrl.size > 0 || relative.size > 0 };
}

function isObjectRecord(value: unknown): value is FhirResource {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
