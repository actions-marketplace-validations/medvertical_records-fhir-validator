import { deriveBundleBaseUrl } from './bundle-reference-utils';

export interface BundleReferenceIndexes {
    fullUrlIndex: Set<string>;
    fullUrlToEntryIndexes: Map<string, number[]>;
    typeIdToFullUrls: Map<string, string[]>;
    requestUrlToEntryIndexes: Map<string, number[]>;
    versionedIndex: Set<string>;
}

export interface ResolvedReference {
    resolvable: boolean;
    hasTypeIdMatch: boolean;
    hasRequestUrlMatch?: boolean;
    multipleMatches?: boolean;
    matchCount?: number;
    matchedFullUrls?: string[];
    matchedRequestUrls?: Array<{ entryIndex: number; requestUrl: string; fullUrl?: string }>;
    logicalReference?: string;
}

export function buildReferenceIndexes(entries: any[]): BundleReferenceIndexes {
    const fullUrlIndex = new Set<string>();
    const fullUrlToEntryIndexes = new Map<string, number[]>();
    const typeIdToFullUrls = new Map<string, string[]>();
    const requestUrlToEntryIndexes = new Map<string, number[]>();
    const versionedIndex = new Set<string>();

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        const entry = entries[entryIndex];
        if (entry.fullUrl) {
            fullUrlIndex.add(entry.fullUrl);
            const indexes = fullUrlToEntryIndexes.get(entry.fullUrl) || [];
            indexes.push(entryIndex);
            fullUrlToEntryIndexes.set(entry.fullUrl, indexes);
        }
        const resource = entry.resource;
        if (resource?.resourceType && resource?.id) {
            const resourceRef = `${resource.resourceType}/${resource.id}`;
            const urls = typeIdToFullUrls.get(resourceRef) || [];
            urls.push(entry.fullUrl || '');
            typeIdToFullUrls.set(resourceRef, urls);
            const versionId = resource.meta?.versionId;
            if (versionId) {
                versionedIndex.add(`${resourceRef}/_history/${versionId}`);
                if (entry.fullUrl) {
                    versionedIndex.add(`${entry.fullUrl}/_history/${versionId}`);
                }
            }
        }
        const requestUrl = typeof entry?.request?.url === 'string' ? entry.request.url : undefined;
        if (requestUrl && isRelativeResourceReference(requestUrl)) {
            const indexes = requestUrlToEntryIndexes.get(requestUrl) || [];
            indexes.push(entryIndex);
            requestUrlToEntryIndexes.set(requestUrl, indexes);
        }
    }

    return { fullUrlIndex, fullUrlToEntryIndexes, typeIdToFullUrls, requestUrlToEntryIndexes, versionedIndex };
}

export function resolveReferenceInBundle(
    ref: string,
    unversioned: string,
    sourceFullUrl: string | undefined,
    indexes: BundleReferenceIndexes,
    strictRefs = false,
): ResolvedReference {
    const refIsVersioned = /^(.*)\/_history\/([^/]+)$/.test(ref);

    if (ref.startsWith('urn:uuid:') || ref.startsWith('urn:oid:')) {
        return { resolvable: indexes.fullUrlIndex.has(ref), hasTypeIdMatch: false };
    }
    if (/^https?:\/\//.test(ref)) {
        return resolveAbsoluteReference(ref, unversioned, refIsVersioned, indexes);
    }

    const hasTypeIdMatch = indexes.typeIdToFullUrls.has(unversioned);
    const typeIdMatchCount = indexes.typeIdToFullUrls.get(unversioned)?.length || 0;
    const matchedRequestUrls = findRequestUrlMatches(unversioned, indexes);
    const requestUrlState = {
        hasRequestUrlMatch: matchedRequestUrls.length > 0,
        matchedRequestUrls,
    };

    if (!sourceFullUrl) {
        return {
            ...resolveWithoutSourceFullUrl(ref, refIsVersioned, hasTypeIdMatch, typeIdMatchCount, indexes),
            ...requestUrlState,
        };
    }
    if (sourceFullUrl.startsWith('urn:')) {
        return { resolvable: false, hasTypeIdMatch, ...requestUrlState };
    }

    const base = deriveBundleBaseUrl(sourceFullUrl);
    if (base) {
        return resolveRelativeWithBase(
            ref,
            unversioned,
            refIsVersioned,
            hasTypeIdMatch,
            typeIdMatchCount,
            indexes,
            base,
            requestUrlState,
        );
    }

    if (strictRefs && !refIsVersioned) {
        return { resolvable: false, hasTypeIdMatch, matchCount: typeIdMatchCount, ...requestUrlState };
    }
    return {
        ...resolveByTypeIdFallback(ref, refIsVersioned, hasTypeIdMatch, typeIdMatchCount, indexes),
        ...requestUrlState,
    };
}

export function extractLogicalReference(reference: string): string | null {
    const relativeMatch = reference.match(/^([A-Z][A-Za-z]+)\/([^/?#|]+)$/);
    if (relativeMatch) {
        return `${relativeMatch[1]}/${relativeMatch[2]}`;
    }

    const absoluteMatch = reference.match(/\/([A-Z][A-Za-z]+)\/([^/?#|]+)$/);
    if (absoluteMatch) {
        return `${absoluteMatch[1]}/${absoluteMatch[2]}`;
    }

    return null;
}

function resolveAbsoluteReference(
    ref: string,
    unversioned: string,
    refIsVersioned: boolean,
    indexes: BundleReferenceIndexes,
): ResolvedReference {
    const directMatch = refIsVersioned
        ? indexes.versionedIndex.has(ref)
        : indexes.fullUrlIndex.has(ref) || indexes.fullUrlIndex.has(unversioned);
    const matchCount = indexes.fullUrlToEntryIndexes.get(ref)?.length
        || indexes.fullUrlToEntryIndexes.get(unversioned)?.length
        || 0;
    const logicalReference = extractLogicalReference(unversioned);
    const matchedFullUrls = logicalReference ? indexes.typeIdToFullUrls.get(logicalReference) || [] : [];
    return {
        resolvable: directMatch && matchCount <= 1,
        hasTypeIdMatch: matchedFullUrls.length > 0,
        multipleMatches: !refIsVersioned && matchCount > 1,
        matchCount,
        matchedFullUrls,
        logicalReference: logicalReference ?? undefined,
    };
}

function resolveWithoutSourceFullUrl(
    ref: string,
    refIsVersioned: boolean,
    hasTypeIdMatch: boolean,
    typeIdMatchCount: number,
    indexes: BundleReferenceIndexes,
): ResolvedReference {
    const resolvable = refIsVersioned
        ? indexes.versionedIndex.has(ref)
        : hasTypeIdMatch || indexes.versionedIndex.has(ref);
    return {
        resolvable: resolvable && (!hasTypeIdMatch || typeIdMatchCount <= 1 || refIsVersioned),
        hasTypeIdMatch: false,
        multipleMatches: !refIsVersioned && typeIdMatchCount > 1,
        matchCount: typeIdMatchCount,
    };
}

function resolveRelativeWithBase(
    ref: string,
    unversioned: string,
    refIsVersioned: boolean,
    hasTypeIdMatch: boolean,
    typeIdMatchCount: number,
    indexes: BundleReferenceIndexes,
    base: string,
    requestUrlState: Pick<ResolvedReference, 'hasRequestUrlMatch' | 'matchedRequestUrls'>,
): ResolvedReference {
    const targetUrl = `${base}${refIsVersioned ? ref : unversioned}`;
    if (refIsVersioned) {
        return {
            resolvable: indexes.versionedIndex.has(targetUrl),
            hasTypeIdMatch,
            matchCount: typeIdMatchCount,
            ...requestUrlState,
        };
    }
    if (indexes.fullUrlIndex.has(targetUrl)) {
        const matchCount = indexes.fullUrlToEntryIndexes.get(targetUrl)?.length || 0;
        return {
            resolvable: matchCount <= 1,
            hasTypeIdMatch: false,
            multipleMatches: matchCount > 1,
            matchCount,
            ...requestUrlState,
        };
    }
    return { resolvable: false, hasTypeIdMatch, ...requestUrlState };
}

function resolveByTypeIdFallback(
    ref: string,
    refIsVersioned: boolean,
    hasTypeIdMatch: boolean,
    typeIdMatchCount: number,
    indexes: BundleReferenceIndexes,
): ResolvedReference {
    const resolvable = refIsVersioned
        ? indexes.versionedIndex.has(ref)
        : hasTypeIdMatch || indexes.versionedIndex.has(ref);
    return {
        resolvable: resolvable && (!hasTypeIdMatch || typeIdMatchCount <= 1 || refIsVersioned),
        hasTypeIdMatch: false,
        multipleMatches: !refIsVersioned && typeIdMatchCount > 1,
        matchCount: typeIdMatchCount,
    };
}

function findRequestUrlMatches(
    unversioned: string,
    indexes: BundleReferenceIndexes,
): Array<{ entryIndex: number; requestUrl: string; fullUrl?: string }> {
    const logicalReference = extractLogicalReference(unversioned) ?? unversioned;
    if (!isRelativeResourceReference(logicalReference)) return [];
    const entryIndexes = indexes.requestUrlToEntryIndexes.get(logicalReference) || [];
    return entryIndexes.map(entryIndex => ({
        entryIndex,
        requestUrl: logicalReference,
    }));
}

function isRelativeResourceReference(value: string): boolean {
    return /^([A-Z][A-Za-z]+)\/([^/?#|]+)$/.test(value);
}
