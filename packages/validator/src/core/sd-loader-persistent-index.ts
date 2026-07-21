/**
 * SDLoader Persistent Index
 * 
 * Caches the results of package scanning to disk so that subsequent
 * startups don't need to rescan all packages (saves 2-4 seconds).
 * 
 * The index is invalidated when:
 * - Any package manifest changes
 * - The index file is missing
 * - The index file version doesn't match
 *
 * Package directory mtimes are deliberately not used here. Container image
 * COPY operations may rewrite them even though the immutable package content
 * is unchanged, which would make a build-time index unusable at runtime.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '../logger';

const INDEX_VERSION = 5; // Bumped: v5 uses stable package-manifest fingerprints
const INDEX_FILENAME = 'sdloader-profile-index.json';

interface PackageIndexEntry {
    name: string;
    profileCount: number;
    /** SHA-256 of package/package.json. */
    manifestHash: string | null;
}

interface SourcePackageIndexEntry {
    name: string;
    /** SHA-256 of package/package.json. */
    manifestHash: string | null;
}

interface ProfileIndex {
    version: number;
    generatedAt: number;
    options?: {
        deduplicatePackages?: boolean;
    };
    /** Packages whose StructureDefinitions were included in profileUrls. */
    packages: PackageIndexEntry[];
    /** All package directories observed under the source path, including deduped/skipped versions. */
    sourcePackages: SourcePackageIndexEntry[];
    profileUrls: string[];
}

export interface PersistentIndexOptions {
    deduplicatePackages?: boolean;
}

/**
 * Get the path to the index file for a given source directory
 */
function getIndexPath(sourcePath: string): string {
    // Store index in the source directory itself
    return path.join(sourcePath, INDEX_FILENAME);
}

/**
 * Get stable identities for all package directories.
 *
 * FHIR packages are immutable and versioned by their package manifest. A
 * missing manifest is retained as a null identity so that the index is never
 * trusted for malformed or incomplete package directories.
 */
async function getPackageManifestHashes(sourcePath: string): Promise<Map<string, string | null>> {
    const manifestHashes = new Map<string, string | null>();

    try {
        const entries = await fs.readdir(sourcePath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== 'node_modules') {
                const manifestPath = path.join(sourcePath, entry.name, 'package', 'package.json');
                try {
                    const manifest = await fs.readFile(manifestPath);
                    const manifestHash = createHash('sha256').update(manifest).digest('hex');
                    manifestHashes.set(entry.name, manifestHash);
                } catch {
                    manifestHashes.set(entry.name, null);
                }
            }
        }
    } catch (_error) {
        logger.debug(`[SDLoaderIndex] Could not read source path: ${sourcePath}`);
    }

    return manifestHashes;
}

/**
 * Check if the index is still valid (no package changes)
 */
async function isIndexValid(index: ProfileIndex, sourcePath: string, options: PersistentIndexOptions): Promise<boolean> {
    // Check version
    if (index.version !== INDEX_VERSION) {
        logger.debug('[SDLoaderIndex] Index version mismatch, will rescan');
        return false;
    }

    if ((index.options?.deduplicatePackages ?? true) !== (options.deduplicatePackages ?? true)) {
        logger.debug('[SDLoaderIndex] Package deduplication mode changed, will rescan');
        return false;
    }

    const currentManifestHashes = await getPackageManifestHashes(sourcePath);

    const indexedSourcePackages = index.sourcePackages ?? index.packages;
    const indexedManifestHashes = new Map(
        indexedSourcePackages.map(p => [p.name, p.manifestHash])
    );

    // Check if any packages were added
    for (const [name] of currentManifestHashes) {
        if (!indexedManifestHashes.has(name)) {
            logger.debug(`[SDLoaderIndex] New package detected: ${name}, will rescan`);
            return false;
        }
    }

    // Check if any packages were removed or modified
    for (const [name, indexedManifestHash] of indexedManifestHashes) {
        const currentManifestHash = currentManifestHashes.get(name);
        if (currentManifestHash === undefined) {
            logger.debug(`[SDLoaderIndex] Package removed: ${name}, will rescan`);
            return false;
        }
        if (currentManifestHash === null || indexedManifestHash === null) {
            logger.debug(`[SDLoaderIndex] Package manifest missing: ${name}, will rescan`);
            return false;
        }
        if (currentManifestHash !== indexedManifestHash) {
            logger.debug(`[SDLoaderIndex] Package manifest changed: ${name}, will rescan`);
            return false;
        }
    }

    return true;
}

/**
 * Load profile URLs from persistent index if valid
 * Returns null if index is missing, invalid, or outdated
 */
export async function loadFromPersistentIndex(
    sourcePath: string,
    options: PersistentIndexOptions = {}
): Promise<Set<string> | null> {
    const indexPath = getIndexPath(sourcePath);

    try {
        const content = await fs.readFile(indexPath, 'utf-8');
        const index: ProfileIndex = JSON.parse(content);

        // Validate index
        if (!await isIndexValid(index, sourcePath, options)) {
            return null;
        }

        const age = Date.now() - index.generatedAt;
        const ageHours = Math.round(age / 3600000);
        logger.info(`[SDLoaderIndex] ✅ Loaded ${index.profileUrls.length} profiles from index (age: ${ageHours}h)`);

        return new Set(index.profileUrls);

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.debug(`[SDLoaderIndex] Could not load index: ${err.message}`);
        }
        return null;
    }
}

/**
 * Save profile URLs to persistent index
 */
export async function saveToPersistentIndex(
    sourcePath: string,
    profileUrls: Set<string>,
    packageDetails: Array<{ name: string; profileCount: number }>,
    options: PersistentIndexOptions = {}
): Promise<void> {
    const indexPath = getIndexPath(sourcePath);

    try {
        const manifestHashes = await getPackageManifestHashes(sourcePath);

        // Build package entries
        const packages: PackageIndexEntry[] = packageDetails.map(p => ({
            name: p.name,
            profileCount: p.profileCount,
            manifestHash: manifestHashes.get(p.name) ?? null
        }));
        const sourcePackages: SourcePackageIndexEntry[] = Array.from(manifestHashes.entries())
            .map(([name, manifestHash]) => ({ name, manifestHash }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const index: ProfileIndex = {
            version: INDEX_VERSION,
            generatedAt: Date.now(),
            options,
            packages,
            sourcePackages,
            profileUrls: Array.from(profileUrls)
        };

        await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
        logger.info(`[SDLoaderIndex] ✅ Saved index with ${profileUrls.size} profiles from ${packages.length} packages`);

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[SDLoaderIndex] Could not save index: ${err.message}`);
    }
}

/**
 * Clear the persistent index (force rescan on next startup)
 */
export async function clearPersistentIndex(sourcePath: string): Promise<void> {
    const indexPath = getIndexPath(sourcePath);

    try {
        await fs.unlink(indexPath);
        logger.info('[SDLoaderIndex] Index cleared');
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.warn(`[SDLoaderIndex] Could not clear index: ${err.message}`);
        }
    }
}
