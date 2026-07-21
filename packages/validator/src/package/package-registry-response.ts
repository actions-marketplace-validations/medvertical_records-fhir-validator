import type { PackageManifest } from './package-registry-types.js';

export async function readResponseBodyBounded(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}

export function isPackageManifestFor(value: unknown, packageId: string): value is PackageManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Partial<PackageManifest>;
  return manifest.name === packageId
    && Boolean(manifest['dist-tags'])
    && typeof manifest['dist-tags'] === 'object'
    && !Array.isArray(manifest['dist-tags'])
    && Boolean(manifest.versions)
    && typeof manifest.versions === 'object'
    && !Array.isArray(manifest.versions);
}
