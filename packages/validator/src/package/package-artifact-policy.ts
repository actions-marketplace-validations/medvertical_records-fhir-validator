import { createHash } from 'node:crypto';

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/;
const PACKAGE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/;

const ALLOWED_TARBALL_HOSTS = new Set([
  'packages.fhir.org',
  'packages.simplifier.net',
  'registry.npmjs.org',
]);

export const DEFAULT_MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
export const HARD_MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRY_BYTES = 256 * 1024 * 1024;
export const MAX_ARCHIVE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 100_000;

const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function isSafePackageId(value: string): boolean {
  return PACKAGE_ID_PATTERN.test(value)
    && !value.includes('..')
    && !value.endsWith('.')
    && !value.includes('#');
}

export function isSafePackageVersion(value: string): boolean {
  return PACKAGE_VERSION_PATTERN.test(value)
    && !value.includes('..')
    && !value.includes('#');
}

export function isAllowedPackageTarballUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && (parsed.port === '' || parsed.port === '443')
      && ALLOWED_TARBALL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isSafePackageArchivePath(value: string): boolean {
  if (!value || value.includes('\0')) return false;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..')) return false;
  return segments[0] === 'package';
}

export function isSafePackageArchiveEntry(
  entryPath: string,
  entryType: string | undefined,
  entrySize: number | undefined,
): boolean {
  const normalizedType = entryType?.toLowerCase();
  return isSafePackageArchivePath(entryPath)
    && normalizedType !== 'symboliclink'
    && normalizedType !== 'symlink'
    && normalizedType !== 'link'
    && normalizedType !== 'hardlink'
    && (entrySize === undefined
      || (Number.isSafeInteger(entrySize) && entrySize >= 0 && entrySize <= MAX_ARCHIVE_ENTRY_BYTES));
}

export function resolvePackageSizeLimit(value?: number): number | null {
  if (value === undefined) return DEFAULT_MAX_PACKAGE_BYTES;
  return Number.isSafeInteger(value) && value > 0 && value <= HARD_MAX_PACKAGE_BYTES
    ? value
    : null;
}

/**
 * Package identifiers and Canonicals can be tenant-specific in enterprise
 * deployments. Keep them out of logs while retaining a stable correlation
 * key that is useful during incident analysis.
 */
export function packageReferenceMetadata(packageId: string, version?: string): {
  packageRef: string;
} {
  return {
    packageRef: fingerprint(`${packageId}#${version ?? 'latest'}`),
  };
}

export function packageTargetMetadata(value: string): { targetRef: string } {
  return { targetRef: fingerprint(value) };
}

/**
 * Never forward arbitrary exception text or stacks from registry responses,
 * archive parsers, or filesystem operations. Those values may contain URLs,
 * local paths, credentials, or attacker-controlled archive metadata.
 */
export function packageErrorMetadata(error: unknown): {
  kind: 'abort' | 'filesystem' | 'network' | 'syntax' | 'unknown';
  code?: string;
} {
  if (error instanceof SyntaxError) return { kind: 'syntax' };
  if (error instanceof TypeError) return { kind: 'network' };

  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; code?: unknown };
    if (candidate.name === 'AbortError') return { kind: 'abort' };
    if (typeof candidate.code === 'string' && SAFE_ERROR_CODE_PATTERN.test(candidate.code)) {
      return { kind: 'filesystem', code: candidate.code };
    }
  }

  return { kind: 'unknown' };
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
