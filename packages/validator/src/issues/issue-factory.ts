/**
 * Factory helpers for standardized ValidationIssue creation.
 */

import {
    computeValidationIssueId,
    type ValidationIssue,
    type ValidationAspect,
    type ValidationSeverity,
} from '@records-fhir/validation-types';
import { ValidationCodes as _ValidationCodes, getCodeMetadata, resolveCode, type ValidationCode } from './message-catalog';
import { formatMessage, getHumanReadableMessage } from './message-templates';
import { normalizeResourceType } from './resource-type-normalizer';

export interface CreateIssueParams {
    code: ValidationCode | string;
    path: string;
    resourceType: string;
    messageParams?: Record<string, unknown>;
    customMessage?: string;
    profile?: string;
    details?: Record<string, unknown>;
    severityOverride?: ValidationSeverity;
    aspectOverride?: ValidationAspect;
    ruleId?: string;
}

function generateIssueId(params: {
    aspect: string;
    severity: ValidationSeverity;
    code: string;
    path: string;
    resourceType: string;
    message: string;
    profile?: string;
    ruleId?: string;
    details: Record<string, unknown>;
}): string {
    return computeValidationIssueId(params);
}

/**
 * Kept for backward-compatible tests/callers. Issue IDs are now deterministic
 * and no longer rely on mutable counters.
 */
export function resetIssueCounter(): void {
}

export function createValidationIssue(params: CreateIssueParams): ValidationIssue {
    const {
        code,
        path,
        resourceType: rawResourceType,
        messageParams = {},
        customMessage,
        profile,
        details,
        severityOverride,
        aspectOverride,
        ruleId,
    } = params;
    const resourceType = normalizeResourceType(rawResourceType, path);

    const resolvedCode = resolveCode(code);
    const metadata = getCodeMetadata(code);

    const aspect: ValidationAspect = aspectOverride || metadata?.aspect || 'structural';
    const severity: ValidationSeverity = severityOverride || metadata?.severity || 'warning';

    const message = customMessage || formatMessage(resolvedCode, messageParams);
    const humanReadable = getHumanReadableMessage(resolvedCode, messageParams);

    const issueDetails: Record<string, unknown> = {
        ...details,
        fieldPath: path,
        resourceType,
        validationType: `${aspect}-validation`,
    };

    for (const [key, value] of Object.entries(messageParams)) {
        if (!(key in issueDetails)) {
            issueDetails[key] = value;
        }
    }

    return {
        id: generateIssueId({
            aspect,
            severity,
            code: resolvedCode,
            path,
            resourceType,
            message,
            profile,
            ruleId,
            details: issueDetails,
        }),
        aspect,
        severity,
        code: resolvedCode,
        message,
        humanReadable,
        path,
        details: issueDetails,
        validationMethod: `${aspect}-validation`,
        timestamp: new Date().toISOString(),
        resourceType,
        schemaVersion: 'R4',
        profile,
        ruleId,
    };
}

const CANONICAL_SYSTEM_SUGGESTIONS: Record<string, string> = {
    'http://terminology.hl7.org/CodeSystem/condition-verstatus':
        'http://terminology.hl7.org/CodeSystem/condition-ver-status',
};

const VALUE_SET_BASE_CANONICAL_SYSTEM_SUGGESTIONS: Record<string, Record<string, string>> = {
    'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical': {
        'http://terminology.hl7.org/CodeSystem/condition-clinical':
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
    },
    'http://hl7.org/fhir/ValueSet/allergyintolerance-verification': {
        'http://terminology.hl7.org/CodeSystem/condition-ver-status':
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        'http://terminology.hl7.org/CodeSystem/condition-verstatus':
            'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
    },
};

function withoutCanonicalVersion(url: string): string {
    return url.split('|')[0] ?? url;
}

function buildBindingViolationDetails(system?: string, valueSet?: string): Record<string, unknown> | undefined {
    if (!system) return undefined;

    const valueSetBase = valueSet ? withoutCanonicalVersion(valueSet) : undefined;
    const contextualSuggestion = valueSetBase
        ? VALUE_SET_BASE_CANONICAL_SYSTEM_SUGGESTIONS[valueSetBase]?.[system]
        : undefined;
    const suggestedSystem = contextualSuggestion ?? CANONICAL_SYSTEM_SUGGESTIONS[system];
    if (!suggestedSystem) return undefined;

    return {
        suggestedSystem,
        fixHint: `Replace Coding.system '${system}' with '${suggestedSystem}'.`,
    };
}

/**
 * Create a terminology binding violation issue.
 * Uses different message templates for primitive codes (no system) vs Coding types (with system).
 */
export function createBindingViolation(params: {
    strength: 'required' | 'extensible' | 'preferred' | 'example';
    code: string;
    system?: string;
    valueSet: string;
    path: string;
    resourceType: string;
    profile?: string;
}): ValidationIssue {
    const hasSystem = params.system !== undefined && params.system !== '';

    const codeMap = hasSystem ? {
        required: 'terminology-binding-required',
        extensible: 'terminology-binding-extensible',
        preferred: 'terminology-binding-preferred',
        example: 'terminology-binding-example',
    } as const : {
        required: 'terminology-binding-required-code',
        extensible: 'terminology-binding-extensible-code',
        preferred: 'terminology-binding-preferred-code',
        example: 'terminology-binding-example-code',
    } as const;

    return createValidationIssue({
        code: codeMap[params.strength],
        path: params.path,
        resourceType: params.resourceType,
        profile: params.profile,
        details: buildBindingViolationDetails(params.system, params.valueSet),
        messageParams: hasSystem ? {
            code: params.code,
            system: params.system,
            valueSet: params.valueSet,
        } : {
            code: params.code,
            valueSet: params.valueSet,
        },
    });
}

/**
 * Create a "binding could not be verified" informational issue.
 *
 * Emitted when a coded element's ValueSet cannot be expanded locally and no
 * terminology server confirmed the code. Distinct from a binding violation:
 * the code is not known to be wrong, only unverifiable. Severity is
 * informational so it never gates, but the skip becomes visible instead of
 * silent (gap P-3).
 */
export function createBindingUnverified(params: {
    strength: 'required' | 'extensible' | 'preferred';
    code: string;
    system?: string;
    valueSet: string;
    path: string;
    resourceType: string;
    profile?: string;
    /** Override the default `information` severity (e.g. `warning` under a strict policy). */
    severityOverride?: ValidationSeverity;
}): ValidationIssue {
    return createValidationIssue({
        code: 'terminology-binding-unverified',
        path: params.path,
        resourceType: params.resourceType,
        profile: params.profile,
        severityOverride: params.severityOverride,
        messageParams: {
            code: params.code,
            system: params.system,
            valueSet: params.valueSet,
            strength: params.strength,
        },
    });
}

export function createRequiredElementMissing(params: {
    element: string;
    path: string;
    resourceType: string;
    profile?: string;
}): ValidationIssue {
    return createValidationIssue({
        code: 'structural-required-element-missing',
        path: params.path,
        resourceType: params.resourceType,
        profile: params.profile,
        messageParams: {
            element: params.element,
        },
    });
}

export function createReferenceTypeMismatch(params: {
    actual: string;
    allowed: string[];
    path: string;
    resourceType: string;
}): ValidationIssue {
    return createValidationIssue({
        code: 'reference-type-mismatch',
        path: params.path,
        resourceType: params.resourceType,
        messageParams: {
            actual: params.actual,
            allowed: params.allowed.join(', '),
        },
    });
}

export function createConstraintViolation(params: {
    key: string;
    message: string;
    path: string;
    resourceType: string;
    profile?: string;
    severity?: ValidationSeverity;
}): ValidationIssue {
    return createValidationIssue({
        code: 'profile-constraint-violation',
        path: params.path,
        resourceType: params.resourceType,
        profile: params.profile,
        severityOverride: params.severity,
        messageParams: {
            key: params.key,
            message: params.message,
        },
    });
}

export function createValidationError(params: {
    message: string;
    path: string;
    resourceType: string;
    aspect?: ValidationAspect;
}): ValidationIssue {
    return createValidationIssue({
        code: 'validation-error',
        path: params.path,
        resourceType: params.resourceType,
        aspectOverride: params.aspect,
        customMessage: params.message,
    });
}
