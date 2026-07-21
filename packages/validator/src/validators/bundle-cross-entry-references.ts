import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { deriveBundleBaseUrl, extractReferencesWithPaths } from './bundle-reference-utils';
import {
    buildReferenceIndexes,
    extractLogicalReference,
    resolveReferenceInBundle,
    type BundleReferenceIndexes,
    type ResolvedReference,
} from './bundle-cross-entry-reference-resolution';

interface ReferenceContext {
    entries: any[];
    entryIndex: number;
    resource: any;
    sourceFullUrl: string | undefined;
    ref: string;
    refPath: string;
    unversioned: string;
    resolved: ResolvedReference;
    isClosedBundle: boolean;
}

export function validateBundleCrossEntryReferences(
    bundle: any,
    bundleType: string | null,
    strictRefs = false,
): ValidationIssue[] {
    const entries: any[] = bundle?.entry ?? [];
    if (entries.length === 0) return [];

    const indexes = buildReferenceIndexes(entries);
    const isClosedBundle = bundleType === 'document' || bundleType === 'message';
    const issues: ValidationIssue[] = [];

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        const resource = entries[entryIndex]?.resource;
        if (!resource) continue;
        issues.push(...validateEntryReferences(
            entries,
            entryIndex,
            resource,
            indexes,
            isClosedBundle,
            strictRefs,
        ));
    }

    return issues;
}

function validateEntryReferences(
    entries: any[],
    entryIndex: number,
    resource: any,
    indexes: BundleReferenceIndexes,
    isClosedBundle: boolean,
    strictRefs: boolean,
): ValidationIssue[] {
    const sourceFullUrl: string | undefined = entries[entryIndex]?.fullUrl;
    const refsWithPaths: { reference: string; path: string }[] = [];
    extractReferencesWithPaths(resource, '', refsWithPaths);

    const issues: ValidationIssue[] = [];
    for (const { reference: ref, path: refPath } of refsWithPaths) {
        if (ref.startsWith('#') || ref.includes('?')) continue;
        const historyMatch = ref.match(/^(.*)\/_history\/[^/]+$/);
        const unversioned = historyMatch ? historyMatch[1] : ref;
        const resolved = resolveReferenceInBundle(ref, unversioned, sourceFullUrl, indexes, strictRefs);
        if (resolved.resolvable) continue;

        issues.push(...createUnresolvedReferenceIssues({
            entries,
            entryIndex,
            resource,
            sourceFullUrl,
            ref,
            refPath,
            unversioned,
            resolved,
            isClosedBundle,
        }, indexes));
    }

    return issues;
}

function createUnresolvedReferenceIssues(
    context: ReferenceContext,
    indexes: BundleReferenceIndexes,
): ValidationIssue[] {
    if (context.isClosedBundle) {
        return createClosedBundleReferenceIssues(context);
    }
    return createOpenBundleReferenceIssues(context, indexes);
}

function createClosedBundleReferenceIssues(context: ReferenceContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const issuePath = getReferenceIssuePath(context);

    if (context.ref.includes('/_history/') && context.resolved.hasTypeIdMatch) {
        issues.push(...createVersionedTypeIdWarnings(context, issuePath));
    }

    const detail = buildTypeIdMismatchDetail(context);

    issues.push(createValidationIssue({
        code: 'bundle-cross-entry-reference-missing',
        path: issuePath,
        resourceType: 'Bundle',
        customMessage: context.resolved.multipleMatches
            ? `Found ${context.resolved.matchCount} matches for '${context.ref}' in the bundle`
            : `Can't find '${context.ref}' in the bundle ` +
                `(${context.resource.resourceType ?? 'entry'}[${context.entryIndex}]).${detail}`,
        severityOverride: 'error',
        details: buildReferenceMismatchDetails(context),
    }));

    return issues;
}

function createVersionedTypeIdWarnings(context: ReferenceContext, issuePath: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const matches = findEntryFullUrlsByLogicalRef(context.entries, context.unversioned);
    const fullTarget = composeFullTarget(context.ref, context.sourceFullUrl);

    issues.push(createValidationIssue({
        code: 'required',
        path: issuePath,
        resourceType: 'Bundle',
        customMessage:
            `The bundle contains no match for ${fullTarget} ` +
            'by the rules of Bundle reference resolution, but it has multiple resources ' +
            `that match ${context.ref} by resource type and id`,
        severityOverride: 'warning',
    }));

    const matchCount = Math.max(matches.length, context.resolved.matchCount || 0);
    for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const matchedFullUrl = matches[matchIndex] || composeFullTarget(context.unversioned, context.sourceFullUrl);
        issues.push(createValidationIssue({
            code: 'required',
            path: issuePath,
            resourceType: 'Bundle',
            customMessage:
                `Entry ${matchIndex + 1} matches the reference ${context.ref} by type and id ` +
                `but its fullUrl ${matchedFullUrl} does not match the full target URL ` +
                `${fullTarget} by Bundle resolution rules`,
            severityOverride: 'warning',
        }));
    }

    return issues;
}

function createOpenBundleReferenceIssues(
    context: ReferenceContext,
    indexes: BundleReferenceIndexes,
): ValidationIssue[] {
    if (!context.resolved.hasTypeIdMatch || !context.sourceFullUrl || context.sourceFullUrl.startsWith('urn:')) {
        return [];
    }

    const issuePath = getReferenceIssuePath(context);
    const matches = indexes.typeIdToFullUrls.get(context.unversioned) || [];

    return matches.map((matchedFullUrl, matchIndex) => {
        const matchedEntryIndex = context.entries.findIndex((entry: any) => entry?.fullUrl === matches[matchIndex]);
        const entryLabel = matchedEntryIndex >= 0 ? matchedEntryIndex + 1 : '?';
        return createValidationIssue({
            code: 'bundle-cross-entry-fullurl-mismatch',
            path: issuePath,
            resourceType: 'Bundle',
            customMessage:
                `Entry ${entryLabel} matches the reference ${context.ref} by type and id ` +
                `but its fullUrl ${matchedFullUrl || '(no fullUrl)'} does not match by Bundle resolution rules`,
            severityOverride: 'warning',
        });
    });
}

function getReferenceIssuePath(context: ReferenceContext): string {
    return (!context.sourceFullUrl || !context.refPath)
        ? `Bundle.entry[${context.entryIndex}].resource`
        : `Bundle.entry[${context.entryIndex}].resource.${context.refPath}`;
}

function composeFullTarget(ref: string, sourceFullUrl: string | undefined): string {
    if (!sourceFullUrl || sourceFullUrl.startsWith('urn:') || /^https?:\/\//.test(ref)) {
        return ref;
    }
    const base = deriveBundleBaseUrl(sourceFullUrl);
    return base ? `${base}${ref}` : ref;
}

function findEntryFullUrlsByLogicalRef(entries: any[], logicalRef: string): string[] {
    const [resourceType, id] = logicalRef.split('/');
    if (!resourceType || !id) return [];

    return entries
        .filter((entry: any) =>
            entry?.resource?.resourceType === resourceType &&
            entry?.resource?.id === id)
        .map((entry: any) => entry?.fullUrl || '');
}

function buildTypeIdMismatchDetail(context: ReferenceContext): string {
    if (!context.resolved.hasTypeIdMatch) {
        if (context.resolved.hasRequestUrlMatch) {
            return ' Note that an entry.request.url matches this reference, but request.url is not used ' +
                'for document/message Bundle reference resolution.';
        }
        return '';
    }
    if (/^https?:\/\//.test(context.ref)) {
        return ' Note that there is a resource in the bundle with the same type and id, ' +
            'but its fullUrl uses a different absolute URL, so it does not match by Bundle resolution rules.';
    }
    return ' Note that there is a resource in the bundle with the same type and id, ' +
        'but it does not match because of the fullUrl based rules around matching relative references.';
}

function buildReferenceMismatchDetails(context: ReferenceContext): Record<string, unknown> {
    const logicalReference = context.resolved.logicalReference ?? extractLogicalReference(context.unversioned);
    const matchedFullUrls = context.resolved.matchedFullUrls
        ?? (logicalReference ? findEntryFullUrlsByLogicalRef(context.entries, logicalReference) : []);

    const details: Record<string, unknown> = {
        reference: context.ref,
        unversionedReference: context.unversioned,
        sourceFullUrl: context.sourceFullUrl,
        sourceEntryIndex: context.entryIndex,
        hasTypeIdMatch: context.resolved.hasTypeIdMatch,
    };

    if (logicalReference) {
        details.logicalReference = logicalReference;
    }
    if (matchedFullUrls.length > 0) {
        details.matchedFullUrls = matchedFullUrls;
        details.fixHint = /^https?:\/\//.test(context.ref)
            ? 'Use a reference that exactly matches the target entry fullUrl, or align the target entry fullUrl with the absolute reference.'
            : 'Use a reference that resolves relative to the source entry fullUrl, or align the target entry fullUrl with that relative target.';
    }
    if (context.resolved.matchedRequestUrls?.length) {
        details.matchedRequestUrls = context.resolved.matchedRequestUrls;
        details.fixHint = 'For document/message bundles, use references that match entry.fullUrl exactly, or use absolute fullUrls with a common base. Do not rely on entry.request.url for internal reference resolution.';
    }

    return details;
}
