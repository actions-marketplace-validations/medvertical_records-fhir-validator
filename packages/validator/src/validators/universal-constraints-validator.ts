/**
 * Universal Constraints Validator
 * 
 * Validates universal FHIR constraints that apply to all resources:
 * 
 * - ele-1: All FHIR elements must have a @value or children
 * - ref-1: If reference has a reference, it SHALL be a literal URL or fragment
 */

import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { logger } from '../logger';
import { getPrimitiveSidecar } from '../core/fhir-primitive-sidecar';

// ============================================================================
// Universal Constraints Validator
// ============================================================================

export class UniversalConstraintsValidator {

    /**
     * Validate universal constraints on any resource
     */
    validate(resource: unknown): ValidationIssue[] {
        if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return [];
        const record = resource as Record<string, unknown>;
        if (typeof record.resourceType !== 'string' || record.resourceType.length === 0) return [];

        const issues: ValidationIssue[] = [];
        const resourceType = record.resourceType;

        logger.debug(`[UniversalConstraints] Validating ${resourceType}`);

        // ele-1: All FHIR elements must have a @value or children
        issues.push(...this.validateEle1(
            record,
            resourceType,
            resourceType,
            new WeakSet<object>(),
        ));

        // ref-1: References must be valid
        issues.push(...this.validateRef1(
            record,
            resourceType,
            resourceType,
            new WeakSet<object>(),
        ));

        return issues;
    }

    /**
     * ele-1: All FHIR elements must have a @value or children
     * 
     * Expression: hasValue() or (children().count() > id.count()) or $this is Parameters
     * Human: All FHIR elements must have a @value or children
     */
    private validateEle1(
        obj: unknown,
        resourceType: string,
        path: string,
        visited: WeakSet<object>,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!obj || typeof obj !== 'object') return issues;
        if (visited.has(obj)) return issues;
        visited.add(obj);

        // Skip arrays, process items individually
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                issues.push(...this.validateEle1(obj[i], resourceType, `${path}[${i}]`, visited));
            }
            return issues;
        }

        // Check for empty objects (no value and no children).
        // Primitive sidecars (_field) count as children only when they carry
        // meaningful FHIR content such as id or extensions.
        const record = obj as Record<string, unknown>;
        const keys = Object.keys(record).filter(k => !k.startsWith('_'));
        const primitiveSidecarKeys = Object.keys(record).filter(k =>
            k.startsWith('_') && k.length > 1 && getPrimitiveSidecar(record, k.slice(1)) !== undefined
        );

        // Empty object check
        if (keys.length === 0 && primitiveSidecarKeys.length === 0 && !path.endsWith(']')) {
            // Allow empty at root level or in certain contexts
            if (path !== resourceType && !path.includes('.extension')) {
                issues.push(createValidationIssue({
                    code: 'ele-1-violation',
                    path,
                    resourceType,
                    customMessage: 'ele-1: All FHIR elements must have a @value or children',
                    severityOverride: 'error',
                }));
            }
        }

        // Recurse into children
        for (const key of keys) {
            if (typeof record[key] === 'object' && record[key] !== null) {
                issues.push(...this.validateEle1(record[key], resourceType, `${path}.${key}`, visited));
            }
        }
        for (const key of primitiveSidecarKeys) {
            const childPath = `${path}.${key.slice(1)}`;
            const sidecar = getPrimitiveSidecar(record, key.slice(1));
            if (sidecar && typeof sidecar === 'object') {
                issues.push(...this.validateEle1(sidecar, resourceType, childPath, visited));
            }
        }

        return issues;
    }

    /**
     * ref-1: If reference has a reference, SHALL have a literal URL or fragment
     * 
     * Expression: reference.exists() implies (reference.startsWith('#') or reference.contains('/'))
     * Human: SHALL have a contained resource if a local reference is provided
     */
    private validateRef1(
        obj: unknown,
        resourceType: string,
        path: string,
        visited: WeakSet<object>,
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!obj || typeof obj !== 'object') return issues;
        if (visited.has(obj)) return issues;
        visited.add(obj);

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                issues.push(...this.validateRef1(obj[i], resourceType, `${path}[${i}]`, visited));
            }
            return issues;
        }

        // Check for reference field
        const record = obj as Record<string, unknown>;
        if (record.reference !== undefined) {
            const ref = record.reference;

            if (typeof ref === 'string' && ref.length > 0) {
                // ref-1: reference must be a fragment, URL/relative URL, or URN.
                const isFragment = ref.startsWith('#');
                const isLiteralUrl = ref.includes('/');
                const isConditionalReference = /^[A-Z][a-zA-Z]+\?.+$/.test(ref);
                const isUrn = ref.startsWith('urn:');

                if (!isFragment && !isLiteralUrl && !isConditionalReference && !isUrn) {
                    issues.push(createValidationIssue({
                        code: 'ref-1-violation',
                        path: `${path}.reference`,
                        resourceType,
                        customMessage: 'ref-1: Reference must be a fragment (#id), literal URL (Type/id), or URN',
                        severityOverride: 'error',
                    }));
                }
            }
        }

        // Recurse into children
        for (const [key, value] of Object.entries(record)) {
            if (typeof value === 'object' && value !== null && key !== 'reference') {
                issues.push(...this.validateRef1(value, resourceType, `${path}.${key}`, visited));
            }
        }

        return issues;
    }
}

// Singleton
export const universalConstraintsValidator = new UniversalConstraintsValidator();
