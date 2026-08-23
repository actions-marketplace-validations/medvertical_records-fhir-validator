import { promises as fs, Dirent } from 'fs';
import * as path from 'path';
import {
    isBetterPackageCandidate,
    isCanonicalAuthorityPackage,
    type PackageMatchCandidate,
} from './valueset-package-utils';
import { BoundedLruCache } from '../cache/bounded-lru-cache';

interface PackageIndexFile {
    filename?: string;
    resourceType?: string;
    url?: string;
    version?: string;
}

interface PackageIndex {
    files?: PackageIndexFile[];
}

interface CachedPackageIndex {
    signature: string;
    promise: Promise<PackageIndexFile[] | null>;
}

const MAX_PACKAGE_INDEX_BYTES = 8 * 1024 * 1024;

export class ValueSetPackageIndexCache {
    private readonly entries = new BoundedLruCache<string, CachedPackageIndex>(512);

    get(packagePath: string): CachedPackageIndex | undefined {
        return this.entries.get(packagePath);
    }

    set(packagePath: string, entry: CachedPackageIndex): void {
        this.entries.set(packagePath, entry);
    }

    clear(): void {
        this.entries.clear();
    }
}

// Accumulates the best fallback candidate across stores; exact requested
// versions never reach this — they short-circuit at the search site.
class BestResourceMatch<T extends { version?: string }> {
    private match: T | null = null;
    private candidate: PackageMatchCandidate | null = null;

    constructor(
        private readonly preferredFhirMajor?: string,
        private readonly canonical?: string,
    ) {}

    offer(parsed: T, packageName: string, storeRank: number): void {
        const candidate: PackageMatchCandidate = {
            packageName,
            isPreferredFhirMajor: packageMatchesMajor(packageName, this.preferredFhirMajor),
            isCanonicalAuthority: this.canonical
                ? isCanonicalAuthorityPackage(packageName, this.canonical)
                : false,
            storeRank,
            resourceVersion: parsed.version,
        };
        if (isBetterPackageCandidate(candidate, this.candidate)) {
            this.match = parsed;
            this.candidate = candidate;
        }
    }

    get value(): T | null {
        return this.match;
    }
}

export async function findResourceInPackages<T extends { url?: string; version?: string }>(
    packageDirectories: string[],
    canonical: string,
    candidateFiles: string[],
    preferredFhirMajor?: string,
    requestedVersion?: string,
): Promise<T | null> {
    const best = new BestResourceMatch<T>(preferredFhirMajor, canonical);

    for (const [storeRank, rootDir] of packageDirectories.entries()) {
        for (const entry of await readPackageEntries(rootDir)) {
            if (!(await resolvesToDirectory(rootDir, entry))) continue;
            for (const fileName of candidateFiles) {
                const filePath = path.join(rootDir, entry.name, 'package', fileName);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const parsed = JSON.parse(content) as T;
                    if (!isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;
                    if (!isSameMajorFallback(parsed.version, requestedVersion)) break;

                    best.offer(parsed, entry.name, storeRank);
                    break;
                } catch { /* keep searching */ }
            }
        }
    }

    return best.value;
}

export async function findResourceByCanonicalScan<T extends { url?: string; version?: string }>(
    packageDirectories: string[],
    canonical: string,
    filePrefix: string,
    preferredFhirMajor?: string,
    requestedVersion?: string,
    indexCache: ValueSetPackageIndexCache = new ValueSetPackageIndexCache(),
): Promise<T | null> {
    const best = new BestResourceMatch<T>(preferredFhirMajor, canonical);

    for (const [storeRank, rootDir] of packageDirectories.entries()) {
        for (const entry of await readPackageEntries(rootDir)) {
            if (!(await resolvesToDirectory(rootDir, entry))) continue;

            const packagePath = path.join(rootDir, entry.name, 'package');
            const indexedFiles = await findIndexedCanonicalFiles(
                packagePath,
                canonical,
                filePrefix,
                indexCache,
            );
            if (indexedFiles) {
                for (const fileEntry of indexedFiles) {
                    const parsed = await readPackageResource<T>(path.join(packagePath, fileEntry.filename!));
                    if (!parsed || !isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;
                    if (!isSameMajorFallback(parsed.version, requestedVersion)) continue;

                    best.offer(parsed, entry.name, storeRank);
                }
                continue;
            }

            let packageFiles: Dirent[];
            try {
                packageFiles = await fs.readdir(packagePath, { withFileTypes: true });
            } catch { continue; }

            for (const fileEntry of packageFiles) {
                if (!(await resolvesToFile(packagePath, fileEntry))) continue;
                if (!fileEntry.name.startsWith(filePrefix) || !fileEntry.name.endsWith('.json')) continue;

                try {
                    const content = await fs.readFile(path.join(packagePath, fileEntry.name), 'utf8');
                    const parsed = JSON.parse(content) as T;
                    if (!isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;
                    if (!isSameMajorFallback(parsed.version, requestedVersion)) continue;

                    best.offer(parsed, entry.name, storeRank);
                } catch { /* keep searching */ }
            }
        }
    }

    return best.value;
}

// readdir order is filesystem-dependent; sorted iteration keeps tie
// resolution between equally-ranked packages reproducible across machines.
async function readPackageEntries(rootDir: string): Promise<Dirent[]> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        return entries.sort((left, right) =>
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    } catch {
        return [];
    }
}

async function findIndexedCanonicalFiles(
    packagePath: string,
    canonical: string,
    resourceType: string,
    indexCache: ValueSetPackageIndexCache,
): Promise<PackageIndexFile[] | null> {
    const files = await readPackageIndex(packagePath, indexCache);
    if (!files) return null;

    return files.filter(file =>
        file.filename &&
        file.resourceType === resourceType &&
        file.url?.split('|')[0] === canonical
    );
}

async function readPackageIndex(
    packagePath: string,
    indexCache: ValueSetPackageIndexCache,
): Promise<PackageIndexFile[] | null> {
    const indexPath = path.join(packagePath, '.index.json');
    let signature: string;
    try {
        const stats = await fs.stat(indexPath, { bigint: true });
        if (!stats.isFile() || stats.size > BigInt(MAX_PACKAGE_INDEX_BYTES)) return null;
        signature = `${stats.dev}:${stats.ino}:${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;
    } catch {
        return null;
    }

    const cached = indexCache.get(packagePath);
    if (cached?.signature === signature) return cached.promise;

    const promise = fs.readFile(indexPath, 'utf8')
        .then(content => {
            const parsed = JSON.parse(content) as PackageIndex;
            return Array.isArray(parsed.files) ? parsed.files : null;
        })
        .catch(() => null);
    indexCache.set(packagePath, { signature, promise });
    return await promise;
}

async function readPackageResource<T>(filePath: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    } catch {
        return null;
    }
}

// Dirent.isDirectory()/isFile() are false for symlinks, which would make
// symlinked package stores (e.g. the bundled-profiles symlink chain)
// invisible — follow the link and classify its target instead.
async function resolvesToDirectory(parentDir: string, entry: Dirent): Promise<boolean> {
    if (entry.isDirectory()) return true;
    if (!entry.isSymbolicLink()) return false;
    try {
        return (await fs.stat(path.join(parentDir, entry.name))).isDirectory();
    } catch { return false; }
}

async function resolvesToFile(parentDir: string, entry: Dirent): Promise<boolean> {
    if (entry.isFile()) return true;
    if (!entry.isSymbolicLink()) return false;
    try {
        return (await fs.stat(path.join(parentDir, entry.name))).isFile();
    } catch { return false; }
}

function isCanonicalMatch(resource: { url?: string }, canonical: string): boolean {
    return !!resource?.url && resource.url.split('|')[0] === canonical;
}

// FHIR core terminology diverges across major releases (e.g. R4
// encounter-status lacks R5's 'completed'), and a non-empty expansion is
// authoritative for required bindings. A cross-major stand-in would therefore
// turn valid codes into errors, whereas no candidate degrades the binding to
// 'unverified'. Same-major (minor/patch) mismatches remain acceptable
// fallbacks, as do candidates that carry no version to compare.
function isSameMajorFallback(candidateVersion: string | undefined, requestedVersion: string | undefined): boolean {
    if (!requestedVersion || !candidateVersion) return true;
    return candidateVersion.split('.')[0] === requestedVersion.split('.')[0];
}

export function packageMatchesMajor(packageName: string, preferredFhirMajor?: string): boolean {
    if (!preferredFhirMajor) return false;
    // Cache directory names carry a `#version` suffix, so a release-suffixed
    // package name (hl7.terminology.r4#6.5.0) never contains `.r4.` — the
    // marker must also be recognised at the end of the bare name.
    const bareName = packageName.toLowerCase().split('#')[0];
    const marker = `.r${preferredFhirMajor}`;
    return bareName.includes(`${marker}.`) ||
        bareName.endsWith(marker) ||
        bareName.includes(`r${preferredFhirMajor}.core`);
}
