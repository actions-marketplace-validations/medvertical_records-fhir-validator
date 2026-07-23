/**
 * Attachment Validator
 *
 * Enforces FHIR R4 Attachment invariants that the core structural executor
 * doesn't catch today:
 *
 * - `Attachment.size` (if present) must equal the decoded byte length of
 *   `Attachment.data` (if present). The Java validator flags this as a
 *   structure issue; see fhir-test-cases `attachment-with-wrong-size`.
 *
 * The Attachment data type is polymorphic and can appear anywhere in a
 * resource tree (e.g. `DocumentReference.content.attachment`,
 * `Patient.photo`, `Media.content`). Rather than enumerate every path,
 * this validator walks the resource and detects attachment-shaped objects
 * by duck-typing on the presence of `data` and/or `size`.
 */

import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { createHash } from 'node:crypto';

export class AttachmentValidator {
    /**
     * Walk a resource and check every Attachment-shaped sub-object.
     */
    validate(resource: any): ValidationIssue[] {
        if (!resource || typeof resource !== 'object') return [];
        const issues: ValidationIssue[] = [];
        const rt = resource.resourceType || 'Resource';
        this.walk(resource, rt, issues);
        return issues;
    }

    private walk(obj: any, path: string, issues: ValidationIssue[]): void {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                this.walk(obj[i], `${path}[${i}]`, issues);
            }
            return;
        }

        // Detect Attachment-shaped objects by duck typing.
        // Required fingerprint: at least one of { data, url } plus one of
        // { size, contentType, title, hash, creation }. This avoids false
        // positives for plain objects that happen to have a `data` field.
        if (this.looksLikeAttachment(obj)) {
            issues.push(...this.checkDataIntegrity(obj, path));
        }

        for (const key of Object.keys(obj)) {
            this.walk(obj[key], `${path}.${key}`, issues);
        }
    }

    private looksLikeAttachment(obj: Record<string, any>): boolean {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;

        const hasContent = typeof obj.data === 'string' || typeof obj.url === 'string';
        const hasAttachmentMarker =
            typeof obj.size === 'number' ||
            typeof obj.contentType === 'string' ||
            typeof obj.title === 'string' ||
            typeof obj.hash === 'string' ||
            typeof obj.creation === 'string';

        return hasContent && hasAttachmentMarker;
    }

    /**
     * `Attachment.size` must equal decoded byte length of `Attachment.data`.
     * Only validates when both fields are present.
     */
    private checkDataIntegrity(
        attachment: Record<string, any>,
        path: string
    ): ValidationIssue[] {
        const { data, size, hash } = attachment;
        if (typeof data !== 'string') return [];

        let decodedData: Buffer;
        try {
            decodedData = Buffer.from(data, 'base64');
        } catch {
            return []; // Let base64 format validation report separately
        }

        const issues: ValidationIssue[] = [];
        if (typeof size === 'number' && decodedData.length !== size) {
            issues.push(createValidationIssue({
                code: 'structural-attachment-size-mismatch',
                // Java emits the error at the Attachment element itself
                // (e.g. "Media.content") rather than `.size`. Matching that
                // lets the conformance diff pick up the shared path.
                path,
                resourceType: path.split('.')[0],
                customMessage:
                    `Stated Attachment Size ${size} does not match actual attachment size ${decodedData.length}`,
                severityOverride: 'error',
                details: {
                    statedSize: size,
                    actualSize: decodedData.length,
                    fieldPath: path,
                },
            }));
        }

        if (typeof hash === 'string') {
            const statedHash = Buffer.from(hash, 'base64');
            const actualHash = createHash('sha1').update(decodedData).digest();
            if (!statedHash.equals(actualHash)) {
                issues.push(createValidationIssue({
                    code: 'structural-attachment-hash-mismatch',
                    path,
                    resourceType: path.split('.')[0],
                    customMessage:
                        `The hash of the Attachment data does not match the stated SHA-1 hash`,
                    severityOverride: 'error',
                    details: {
                        statedHash: hash,
                        actualHash: actualHash.toString('base64'),
                        hashAlgorithm: 'SHA-1',
                        fieldPath: path,
                        fixHint: 'Recompute Attachment.hash as the base64-encoded SHA-1 digest of Attachment.data.',
                    },
                }));
            }
        }

        return issues;
    }
}
