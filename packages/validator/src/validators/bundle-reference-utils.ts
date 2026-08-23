export interface BundleReferencePath {
    reference: string;
    path: string;
}

export function extractReferencesWithPaths(
    obj: unknown,
    currentPath: string,
    refs: BundleReferencePath[],
): void {
    extractReferencesWithPathsInternal(
        obj,
        currentPath,
        refs,
        new WeakSet<object>(),
    );
}

function extractReferencesWithPathsInternal(
    obj: unknown,
    currentPath: string,
    refs: BundleReferencePath[],
    ancestors: WeakSet<object>,
): void {
    if (!obj || typeof obj !== 'object' || ancestors.has(obj)) return;
    ancestors.add(obj);
    try {
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                extractReferencesWithPathsInternal(
                    obj[i],
                    `${currentPath}[${i}]`,
                    refs,
                    ancestors,
                );
            }
            return;
        }
        const record = obj as Record<string, unknown>;
        if (typeof record.reference === 'string' && record.reference.length > 0) {
            refs.push({ reference: record.reference, path: currentPath });
        }
        for (const key of Object.keys(record)) {
            if (key === 'contained') continue;
            const childPath = currentPath ? `${currentPath}.${key}` : key;
            extractReferencesWithPathsInternal(
                record[key],
                childPath,
                refs,
                ancestors,
            );
        }
    } finally {
        ancestors.delete(obj);
    }
}

/**
 * Collect Attachment.url values (e.g. DiagnosticReport.presentedForm,
 * DocumentReference.content.attachment). The HL7 validator counts these as
 * links when checking that document-bundle entries are interlinked, so a
 * Binary carried in the bundle and referenced only via an attachment URL is
 * still reachable. The walker is type-blind, so attachments are recognised
 * by shape: a `url` string next to at least one Attachment-only sibling —
 * Extension nodes can never carry those siblings, which keeps extension
 * canonical URLs out of the link graph.
 */
export function extractAttachmentUrls(obj: unknown, urls: string[] = []): string[] {
    extractAttachmentUrlsInternal(obj, urls, new WeakSet<object>());
    return urls;
}

const ATTACHMENT_ONLY_SIBLINGS = ['contentType', 'data', 'title', 'creation', 'size', 'hash', 'language'];

function extractAttachmentUrlsInternal(
    obj: unknown,
    urls: string[],
    ancestors: WeakSet<object>,
): void {
    if (!obj || typeof obj !== 'object' || ancestors.has(obj)) return;
    ancestors.add(obj);
    try {
        if (Array.isArray(obj)) {
            for (const item of obj) extractAttachmentUrlsInternal(item, urls, ancestors);
            return;
        }
        const record = obj as Record<string, unknown>;
        if (
            typeof record.url === 'string' && record.url.length > 0 &&
            ATTACHMENT_ONLY_SIBLINGS.some(key => record[key] !== undefined)
        ) {
            urls.push(record.url);
        }
        for (const key of Object.keys(record)) {
            if (key === 'contained') continue;
            extractAttachmentUrlsInternal(record[key], urls, ancestors);
        }
    } finally {
        ancestors.delete(obj);
    }
}

export function extractReferences(obj: unknown, refs: string[] = []): string[] {
    const hits: BundleReferencePath[] = [];
    extractReferencesWithPaths(obj, '', hits);
    refs.push(...hits.map(hit => hit.reference));
    return refs;
}

export function deriveBundleBaseUrl(fullUrl: string): string | null {
    if (!fullUrl || fullUrl.startsWith('urn:')) return null;

    const match = fullUrl.match(/^(https?:\/\/.+\/)[A-Z][a-zA-Z]+\/[^/]+$/);
    if (match) return match[1];

    const lastSlash = fullUrl.lastIndexOf('/');
    if (lastSlash <= 0) return null;
    const secondLast = fullUrl.lastIndexOf('/', lastSlash - 1);
    if (secondLast <= 0) return null;
    return fullUrl.substring(0, secondLast + 1);
}
