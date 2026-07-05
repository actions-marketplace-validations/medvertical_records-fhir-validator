import { promises as fs, Dirent } from 'fs';
import * as path from 'path';
import { isBetterPackageMatch } from './valueset-package-utils';

interface PackageIndexFile {
    filename?: string;
    resourceType?: string;
    url?: string;
    version?: string;
}

interface PackageIndex {
    files?: PackageIndexFile[];
}

const packageIndexCache = new Map<string, Promise<PackageIndexFile[] | null>>();

export async function findResourceInPackages<T extends { url?: string; version?: string }>(
    packageDirectories: string[],
    canonical: string,
    candidateFiles: string[],
    preferredFhirMajor?: string,
    requestedVersion?: string,
): Promise<T | null> {
    let bestMatch: T | null = null;
    let bestIsPreferred = false;
    let bestPackageName: string | null = null;

    for (const rootDir of packageDirectories) {
        let packageDirs: Dirent[];
        try {
            packageDirs = await fs.readdir(rootDir, { withFileTypes: true });
        } catch { continue; }

        for (const entry of packageDirs) {
            if (!entry.isDirectory()) continue;
            for (const fileName of candidateFiles) {
                const filePath = path.join(rootDir, entry.name, 'package', fileName);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const parsed = JSON.parse(content) as T;
                    if (!isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;

                    const isPreferred = packageMatchesMajor(entry.name, preferredFhirMajor);
                    if (isBetterPackageMatch(entry.name, isPreferred, bestPackageName, bestIsPreferred)) {
                        bestMatch = parsed;
                        bestIsPreferred = isPreferred;
                        bestPackageName = entry.name;
                    }
                    break;
                } catch { /* keep searching */ }
            }
        }
    }

    return bestMatch;
}

export async function findResourceByCanonicalScan<T extends { url?: string; version?: string }>(
    packageDirectories: string[],
    canonical: string,
    filePrefix: string,
    preferredFhirMajor?: string,
    requestedVersion?: string,
): Promise<T | null> {
    let bestMatch: T | null = null;
    let bestIsPreferred = false;
    let bestPackageName: string | null = null;

    for (const rootDir of packageDirectories) {
        let packageDirs: Dirent[];
        try {
            packageDirs = await fs.readdir(rootDir, { withFileTypes: true });
        } catch { continue; }

        for (const entry of packageDirs) {
            if (!entry.isDirectory()) continue;

            const packagePath = path.join(rootDir, entry.name, 'package');
            const indexedFiles = await findIndexedCanonicalFiles(packagePath, canonical, filePrefix);
            if (indexedFiles) {
                for (const fileEntry of indexedFiles) {
                    const parsed = await readPackageResource<T>(path.join(packagePath, fileEntry.filename!));
                    if (!parsed || !isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;

                    const isPreferred = packageMatchesMajor(entry.name, preferredFhirMajor);
                    if (isBetterPackageMatch(entry.name, isPreferred, bestPackageName, bestIsPreferred)) {
                        bestMatch = parsed;
                        bestIsPreferred = isPreferred;
                        bestPackageName = entry.name;
                    }
                }
                continue;
            }

            let packageFiles: Dirent[];
            try {
                packageFiles = await fs.readdir(packagePath, { withFileTypes: true });
            } catch { continue; }

            for (const fileEntry of packageFiles) {
                if (!fileEntry.isFile()) continue;
                if (!fileEntry.name.startsWith(filePrefix) || !fileEntry.name.endsWith('.json')) continue;

                try {
                    const content = await fs.readFile(path.join(packagePath, fileEntry.name), 'utf8');
                    const parsed = JSON.parse(content) as T;
                    if (!isCanonicalMatch(parsed, canonical)) continue;
                    if (requestedVersion && parsed.version === requestedVersion) return parsed;

                    const isPreferred = packageMatchesMajor(entry.name, preferredFhirMajor);
                    if (isBetterPackageMatch(entry.name, isPreferred, bestPackageName, bestIsPreferred)) {
                        bestMatch = parsed;
                        bestIsPreferred = isPreferred;
                        bestPackageName = entry.name;
                    }
                } catch { /* keep searching */ }
            }
        }
    }

    return bestMatch;
}

async function findIndexedCanonicalFiles(
    packagePath: string,
    canonical: string,
    resourceType: string,
): Promise<PackageIndexFile[] | null> {
    const files = await readPackageIndex(packagePath);
    if (!files) return null;

    return files.filter(file =>
        file.filename &&
        file.resourceType === resourceType &&
        file.url?.split('|')[0] === canonical
    );
}

function readPackageIndex(packagePath: string): Promise<PackageIndexFile[] | null> {
    const cached = packageIndexCache.get(packagePath);
    if (cached) return cached;

    const promise = fs.readFile(path.join(packagePath, '.index.json'), 'utf8')
        .then(content => {
            const parsed = JSON.parse(content) as PackageIndex;
            return Array.isArray(parsed.files) ? parsed.files : null;
        })
        .catch(() => null);
    packageIndexCache.set(packagePath, promise);
    return promise;
}

async function readPackageResource<T>(filePath: string): Promise<T | null> {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    } catch {
        return null;
    }
}

function isCanonicalMatch(resource: { url?: string }, canonical: string): boolean {
    return !!resource?.url && resource.url.split('|')[0] === canonical;
}

function packageMatchesMajor(packageName: string, preferredFhirMajor?: string): boolean {
    if (!preferredFhirMajor) return false;
    const dirName = packageName.toLowerCase();
    return dirName.includes(`.r${preferredFhirMajor}.`) ||
        dirName.includes(`r${preferredFhirMajor}.core`);
}
