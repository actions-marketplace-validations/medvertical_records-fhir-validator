/**
 * ValueSet Package Loader
 * 
 * Loads ValueSet and CodeSystem resources from local FHIR packages.
 * Extracted from valueset-validator.ts for modularity.
 */
import * as path from 'path';
import * as os from 'os';
import type {
    ValueSet,
    CodeSystem,
} from './valueset-types';
import { ValueSetCache, valueSetCache } from './valueset-cache';
import { logger } from '../logger';
import { extractCodesFromCodeSystem } from './valueset-concept-utils';
import {
    type FhirVersion,
    preferredMajorFor,
    versionedCacheKey,
} from './valueset-package-utils';
import {
    findResourceByCanonicalScan,
    findResourceInPackages,
} from './valueset-package-search';
import {
    collectCodesFromValueSet,
    collectIncludeConceptFilters,
    type ValueSetConceptFilter,
} from './valueset-package-expansion';

export type { ValueSetConceptFilter };

// ============================================================================
// Package Loader
// ============================================================================

export class ValueSetPackageLoader {
    private packageDirectories: string[];
    private missingCodeSystemKeys = new Set<string>();
    private pendingCodeSystemLoads = new Map<string, Promise<CodeSystem | null>>();

    constructor(private cache: ValueSetCache = valueSetCache) {
        this.packageDirectories = this.computePackageDirectories();
    }

    /**
     * Determine package directories to search for ValueSet resources
     */
    private computePackageDirectories(): string[] {
        const directories: string[] = [];

        // Primary cache (allows override via env)
        const envPath = process.env.FHIR_PACKAGE_CACHE_PATH;
        if (envPath) {
            directories.push(path.resolve(expandHomePath(envPath)));
        } else {
            directories.push(path.join(os.homedir(), '.fhir', 'packages'));
        }

        // Bundled packages shipped with the application
        directories.push(path.join(process.cwd(), 'server', 'data', 'fhir-packages'));

        // Current workspace package bundle used by the local validator and
        // conformance tooling.
        directories.push(path.join(process.cwd(), 'packages', 'bundled-profiles', 'storage', 'profiles', 'bundled'));

        // Legacy bundled IG location kept for server-side deployments.
        directories.push(path.join(process.cwd(), 'server', 'data', 'bundled-igs'));

        // Bundled profiles (FHIR R4 Core, IGs, etc.)
        directories.push(path.join(process.cwd(), 'server', 'storage', 'profiles', 'bundled'));

        // Deduplicate while preserving order
        return Array.from(new Set(directories));
    }

    /**
     * Get package directories (for testing)
     */
    getPackageDirectories(): string[] {
        return [...this.packageDirectories];
    }

    /** Clear loader-local negative/single-flight state after packages change. */
    clearLookupState(): void {
        this.missingCodeSystemKeys.clear();
        this.pendingCodeSystemLoads.clear();
    }

    /**
     * Scan all package directories for a FHIR resource matching the given
     * canonical URL. When `preferredFhirMajor` is set, prefer packages whose
     * directory name contains the FHIR version (e.g. "r5"). When
     * `requestedVersion` is set, an exact match on `resource.version` wins
     * immediately.
     */
    private async findInPackages<T extends { url?: string; version?: string }>(
        canonical: string,
        candidateFiles: string[],
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<T | null> {
        return findResourceInPackages(
            this.packageDirectories,
            canonical,
            candidateFiles,
            preferredFhirMajor,
            requestedVersion,
        );
    }

    private async findByCanonicalScan<T extends { url?: string; version?: string }>(
        canonical: string,
        filePrefix: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<T | null> {
        return findResourceByCanonicalScan(
            this.packageDirectories,
            canonical,
            filePrefix,
            preferredFhirMajor,
            requestedVersion,
        );
    }

    /**
     * Attempt to load a ValueSet definition from local packages and return its codes
     */
    async loadValueSet(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<string[] | null> {
        const parts = valueSetUrl.split('|');
        const canonical = parts[0];
        const requestedVersion = parts[1];
        const cacheKey = versionedCacheKey(canonical, requestedVersion, fhirVersion);
        if (this.cache.hasValueSetFile(cacheKey)) {
            const cached = this.cache.getValueSetFile(cacheKey);
            return cached ? await this.extractCodesFromValueSet(cached) : null;
        }
        const lastSegment = canonical.split('/').pop();
        if (!lastSegment) { this.cache.setValueSetFile(cacheKey, null); return null; }
        const preferredMajor = requestedVersion ? requestedVersion.split('.')[0] : preferredMajorFor(fhirVersion);
        const bestMatch = await this.findInPackages<ValueSet>(
            canonical,
            [`ValueSet-${lastSegment}.json`, `${lastSegment}.json`],
            preferredMajor,
            requestedVersion,
        ) ?? await this.findByCanonicalScan<ValueSet>(
            canonical,
            'ValueSet',
            preferredMajor,
            requestedVersion,
        );
        if (bestMatch) {
            this.cache.setValueSetFile(cacheKey, bestMatch);
            return await this.extractCodesFromValueSet(bestMatch);
        }
        this.cache.setValueSetFile(cacheKey, null);
        return null;
    }

    /**
     * Return include filters from a ValueSet definition. This lets callers
     * distinguish a complete local expansion from a partial one where a
     * CodeSystem filter needs terminology-server evaluation.
     */
    async getIncludeConceptFilters(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<ValueSetConceptFilter[]> {
        const valueSet = await this.loadValueSetResource(valueSetUrl, fhirVersion);
        if (!valueSet) return [];

        return collectIncludeConceptFilters(valueSet, this, new Set(), 0, preferredMajorFor(fhirVersion));
    }

    /**
     * Load a CodeSystem from local packages by its canonical URL
     */
    async loadCodeSystem(
        systemUrl: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<CodeSystem | null> {
        const cacheKey = requestedVersion
            ? `${systemUrl}|${requestedVersion}`
            : preferredFhirMajor
                ? `${systemUrl}|fhir${preferredFhirMajor}`
                : systemUrl;
        if (this.cache.hasCodeSystemFile(cacheKey)) {
            const cached = this.cache.getCodeSystemFile(cacheKey);
            if (cached) return cached;
            // A null in the shared cache may predate this loader and a package
            // install. Only trust misses observed by this loader; cache resets
            // explicitly clear this local set.
            if (this.missingCodeSystemKeys.has(cacheKey)) return null;
        }
        const pending = this.pendingCodeSystemLoads.get(cacheKey);
        if (pending) return pending;

        const load = this.loadCodeSystemUncached(
            systemUrl,
            cacheKey,
            preferredFhirMajor,
            requestedVersion,
        );
        this.pendingCodeSystemLoads.set(cacheKey, load);
        try {
            return await load;
        } finally {
            this.pendingCodeSystemLoads.delete(cacheKey);
        }
    }

    private async loadCodeSystemUncached(
        systemUrl: string,
        cacheKey: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<CodeSystem | null> {
        const canonical = systemUrl.split('|')[0];
        const lastSegment = canonical.split('/').pop();
        if (!lastSegment) {
            this.cache.setCodeSystemFile(cacheKey, null);
            this.missingCodeSystemKeys.add(cacheKey);
            return null;
        }
        const bestMatch = await this.findInPackages<CodeSystem>(
            canonical,
            [`CodeSystem-${lastSegment}.json`, `${lastSegment}.json`],
            preferredFhirMajor,
            requestedVersion,
        ) ?? await this.findByCanonicalScan<CodeSystem>(
            canonical,
            'CodeSystem',
            preferredFhirMajor,
            requestedVersion,
        );
        if (bestMatch) {
            this.missingCodeSystemKeys.delete(cacheKey);
            this.cache.setCodeSystemFile(cacheKey, bestMatch);
            this.cache.setCodeSystem(cacheKey, bestMatch);
            this.cache.setCodeSystemFile(canonical, bestMatch);
            this.cache.setCodeSystem(canonical, bestMatch);
            return bestMatch;
        }
        this.cache.setCodeSystemFile(cacheKey, null);
        this.missingCodeSystemKeys.add(cacheKey);
        return null;
    }

    /**
     * Extract codes from a ValueSet resource (expansion or compose/include).
     *
     * Supports:
     * - Pre-expanded `expansion.contains` (including hierarchical `contains`)
     * - `compose.include` with explicit concepts
     * - `compose.include` referencing a CodeSystem (full system inclusion)
     * - `compose.include.valueSet` — recursive ValueSet composition
     * - `compose.include.filter` — basic `concept is-a <code>` + `=` filters
     * - `compose.exclude` — removes codes from the result set
     * - CodeSystem supplements (merges extra properties without contributing
     *   codes, which is the correct FHIR semantics)
     */
    async extractCodesFromValueSet(valueSet: ValueSet): Promise<string[]> {
        // Guard against recursive composition cycles AND unbounded depth.
        // Cycle detection via `visited` covers the A → B → A case, but a
        // deeply-nested non-cyclic tree (A → B → C → ... → Z) could still
        // blow the call stack on pathological inputs. `MAX_COMPOSITION_DEPTH`
        // puts an explicit ceiling on that — any real-world FHIR ValueSet
        // composition tree is under 10 levels deep.
        const visited = new Set<string>();
        // Derive preferred FHIR major version from the ValueSet's own version
        // (e.g. "5.0.0" → "5") so CodeSystem lookups prefer the correct package.
        const vsMajor = valueSet.version?.split('.')[0];
        const codes = await collectCodesFromValueSet(valueSet, this, visited, 0, vsMajor);
        logger.debug(
            `[ValueSetPackageLoader] extractCodesFromValueSet returning ${codes.length} codes`,
        );
        return codes;
    }

    /**
     * Load a ValueSet resource (not just its codes) for use in recursive
     * composition. Uses the same package search path as `loadValueSet`.
     */
    async loadValueSetResource(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<ValueSet | null> {
        const [canonical, requestedVersion] = valueSetUrl.split('|');
        const cacheKey = versionedCacheKey(canonical, requestedVersion, fhirVersion);
        if (this.cache.hasValueSetFile(cacheKey)) {
            return this.cache.getValueSetFile(cacheKey) ?? null;
        }
        const lastSegment = canonical.split('/').pop();
        if (!lastSegment) {
            this.cache.setValueSetFile(cacheKey, null);
            return null;
        }
        const preferredMajor = requestedVersion ? requestedVersion.split('.')[0] : preferredMajorFor(fhirVersion);
        const result = await this.findInPackages<ValueSet>(
            canonical,
            [`ValueSet-${lastSegment}.json`, `${lastSegment}.json`],
            preferredMajor,
            requestedVersion,
        ) ?? await this.findByCanonicalScan<ValueSet>(
            canonical,
            'ValueSet',
            preferredMajor,
            requestedVersion,
        );
        this.cache.setValueSetFile(cacheKey, result ?? null);
        return result;
    }

    /**
     * Extract all codes from a CodeSystem (including nested concepts).
     *
     * Supplements are ignored here — per FHIR semantics, a supplement adds
     * properties/designations to another CodeSystem but does not contribute
     * new codes. The base CodeSystem should be loaded separately.
     */
    extractCodesFromCodeSystem(codeSystem: CodeSystem): string[] {
        return extractCodesFromCodeSystem(codeSystem);
    }
}

function expandHomePath(pathStr: string): string {
    if (pathStr.startsWith('$HOME/') || pathStr.startsWith('$HOME\\')) {
        return pathStr.replace('$HOME', process.env.HOME || os.homedir() || '/tmp');
    }
    if (pathStr.startsWith('${HOME}/') || pathStr.startsWith('${HOME}\\')) {
        return pathStr.replace('${HOME}', process.env.HOME || os.homedir() || '/tmp');
    }
    if (pathStr.startsWith('~/')) {
        return pathStr.replace('~', process.env.HOME || os.homedir() || '/tmp');
    }
    return pathStr;
}
