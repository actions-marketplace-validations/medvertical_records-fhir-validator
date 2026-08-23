import {
  extractBundleEntries,
  findReferencesInResource,
} from './bundle-reference-finder';

export function extractReferencesFromResource(resource: unknown): string[] {
  return findReferencesInResource(resource, '', { includeContained: true })
    .map(({ reference }) => reference);
}

export function extractReferencesFromBundle(bundle: unknown): string[] {
  return extractBundleEntries(bundle).flatMap(entry =>
    entry.resource ? extractReferencesFromResource(entry.resource) : []
  );
}
