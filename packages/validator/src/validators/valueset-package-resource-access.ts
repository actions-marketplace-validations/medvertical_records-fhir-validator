/**
 * Filesystem boundary for resolving terminology resources from local FHIR packages.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDefaultBundledProfilesPath } from '../core/sd-loader-bundled-path';
import { getProfileSourcePackageDirectories } from '../persistence';
import {
    findResourceByCanonicalScan,
    findResourceInPackages,
    ValueSetPackageIndexCache,
} from './valueset-package-search';

interface CanonicalResource {
    url?: string;
    version?: string;
}

export class ValueSetPackageResourceAccess {
    private readonly packageIndexCache = new ValueSetPackageIndexCache();
    private readonly explicitPackageDirectories: string[] | null;

    constructor(packageDirectories?: string[]) {
        this.explicitPackageDirectories = packageDirectories ? [...packageDirectories] : null;
    }

    /**
     * Explicit constructor directories are used verbatim (test isolation);
     * otherwise host stores declared via `setProfileSource` are searched
     * before the built-in defaults. Resolved lazily so a profile source
     * installed after loader construction still takes effect.
     */
    getPackageDirectories(): string[] {
        if (this.explicitPackageDirectories) return [...this.explicitPackageDirectories];
        return resolveValueSetPackageDirectories();
    }

    clear(): void {
        this.packageIndexCache.clear();
    }

    async findInPackages<T extends CanonicalResource>(
        canonical: string,
        candidateFiles: string[],
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<T | null> {
        return findResourceInPackages(
            this.getPackageDirectories(),
            canonical,
            candidateFiles,
            preferredFhirMajor,
            requestedVersion,
        );
    }

    async findByCanonicalScan<T extends CanonicalResource>(
        canonical: string,
        filePrefix: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<T | null> {
        return findResourceByCanonicalScan(
            this.getPackageDirectories(),
            canonical,
            filePrefix,
            preferredFhirMajor,
            requestedVersion,
            this.packageIndexCache,
        );
    }

    /**
     * Well-known-filename lookup with canonical-scan fallback. The scan also
     * runs when the filename path only produced a same-major fallback for a
     * pinned version: an exact pin present anywhere (e.g. under an
     * unconventional filename) outranks any fallback.
     */
    async findResource<T extends CanonicalResource>(
        canonical: string,
        candidateFiles: string[],
        filePrefix: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<T | null> {
        const named = await this.findInPackages<T>(
            canonical, candidateFiles, preferredFhirMajor, requestedVersion,
        );
        if (named && (!requestedVersion || named.version === requestedVersion)) return named;

        const scanned = await this.findByCanonicalScan<T>(
            canonical, filePrefix, preferredFhirMajor, requestedVersion,
        );
        if (!named) return scanned;
        return scanned?.version === requestedVersion ? scanned : named;
    }
}

/**
 * Package stores terminology resources resolve from, in search order. Also
 * the store set dependency pinning consults for ValueSet/CodeSystem
 * canonicals — pins must observe exactly the stores the loader searches.
 */
export function resolveValueSetPackageDirectories(): string[] {
    return Array.from(new Set([
        ...getProfileSourcePackageDirectories(),
        ...defaultPackageDirectories(),
    ]));
}

// Repo-relative defaults must not depend on process.cwd() — embedders (CLI,
// MCP, editors) frequently start elsewhere and would silently lose the
// bundled store. This module sits at packages/validator/{src,dist}/validators,
// so the monorepo root is four levels up in both layouts; outside the
// monorepo the resulting paths simply do not exist and are skipped.
const MONOREPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', '..',
);

// Bundled/repo stores rank before the user package cache: their content is
// version-controlled and identical across machines, while ~/.fhir/packages
// holds whatever any tool happened to download. The cache stays last as a
// supplemental fallback so resolution never depends on local download history
// when a controlled copy exists.
function defaultPackageDirectories(): string[] {
    const configuredCachePath = process.env.FHIR_PACKAGE_CACHE_PATH;
    const bundledProfilesPath = resolveDefaultBundledProfilesPath();
    const directories = [
        path.join(MONOREPO_ROOT, 'server', 'data', 'fhir-packages'),
        path.join(MONOREPO_ROOT, 'packages', 'bundled-profiles', 'storage', 'profiles', 'bundled'),
        ...(bundledProfilesPath ? [bundledProfilesPath] : []),
        path.join(MONOREPO_ROOT, 'server', 'data', 'bundled-igs'),
        path.join(MONOREPO_ROOT, 'server', 'storage', 'profiles', 'bundled'),
        configuredCachePath
            ? path.resolve(expandHomePath(configuredCachePath))
            : path.join(os.homedir(), '.fhir', 'packages'),
    ];

    return Array.from(new Set(directories));
}

function expandHomePath(pathValue: string): string {
    const homeDirectory = process.env.HOME || os.homedir() || '/tmp';
    if (pathValue.startsWith('$HOME/') || pathValue.startsWith('$HOME\\')) {
        return pathValue.replace('$HOME', homeDirectory);
    }
    if (pathValue.startsWith('${HOME}/') || pathValue.startsWith('${HOME}\\')) {
        return pathValue.replace('${HOME}', homeDirectory);
    }
    if (pathValue.startsWith('~/')) {
        return pathValue.replace('~', homeDirectory);
    }
    return pathValue;
}
