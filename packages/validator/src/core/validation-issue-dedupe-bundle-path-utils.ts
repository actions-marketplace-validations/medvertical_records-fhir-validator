const INDEXED_BUNDLE_ENTRY_RESOURCE_PATH =
  /^Bundle\.entry\[\d+\]\.resource(?:\/\*[^*]*\*\/)?(?:\.|$)/i;

export function isIndexedBundleEntryResourcePath(path: string): boolean {
  return INDEXED_BUNDLE_ENTRY_RESOURCE_PATH.test(path.trim());
}

export function hasBundleEntryResourceIdentity(path: string): boolean {
  return /^Bundle\.entry\[\d+\]\.resource\/\*[^*]*\*\//i.test(path.trim());
}

/** Entry index keeps resources distinct after removing the display-only identity annotation. */
export function normalizeIndexedBundleEntryResourcePath(path: string): string {
  return path.replace(
    /(Bundle\.entry\[\d+\]\.resource)\/\*[^*]*\*\//gi,
    '$1',
  );
}
