/**
 * Type Validator
 * 
 * Validates FHIR data types:
 * - Primitive types (string, integer, boolean, decimal, etc.)
 * - Complex types (CodeableConcept, Reference, Identifier, etc.)
 * - FHIRPath type system URLs (System.String, System.Integer, etc.)
 * 
 * Handles type equivalence across different type systems:
 * - FHIR primitives (string, id, integer)
 * - FHIRPath types (http://hl7.org/fhirpath/System.String)
 */

import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { normalizeResourceType } from '../issues/resource-type-normalizer';
import type { ElementType } from '../core/structure-definition-types';
import { normalizeFhirType, getTypeDescription } from '../terminology';
import { validateUriFormat } from './uri-format-validator';
import {
  getActualFhirType,
  isExtensionOnly,
  matchesComplexType,
  matchesPrimitiveType,
  PRIMITIVE_TYPE_CODES,
} from './type-matching-helpers';
import { getResolvedPrimitiveSidecarType, isResolvedPrimitiveSidecarValue } from '../core/fhir-primitive-sidecar';

const INVALID_FORMAT_VALUE_PREVIEW_LIMIT = 120;

// ============================================================================
// Type Validator
// ============================================================================

export class TypeValidator {
  /**
   * Validate type of a value
   */
  async validate(
    value: any,
    types: ElementType[],
    path: string,
    profileUrl?: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // If no types specified, skip validation
    if (!types || types.length === 0) {
      return issues;
    }

    // Handle array values
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const itemIssues = await this.validateSingle(value[i], types, `${path}[${i}]`, profileUrl);
        issues.push(...itemIssues);
      }
      return issues;
    }

    // Validate single value
    return this.validateSingle(value, types, path, profileUrl);
  }

  /**
   * Validate a single value against type definitions
   */
  private async validateSingle(
    value: any,
    types: ElementType[],
    path: string,
    profileUrl?: string
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const effectiveTypes = narrowTypesForConcreteChoicePath(types, path);
    const resourceType = inferResourceTypeFromPath(path);

    // Try each allowed type
    let matchedType = false;

    for (const type of effectiveTypes) {
      const typeCode = type.code;

      // Check if value matches this type
      if (await this.matchesType(value, typeCode)) {
        matchedType = true;

        // Additional format validation for URIs
        // HAPI strictly validates that 'uri' and 'canonical' are absolute URIs (e.g. in system fields)
        const normalizedType = normalizeFhirType(typeCode);
        const effectiveType = normalizedType || typeCode;

        if (typeof value === 'string' && ['uri', 'canonical'].includes(effectiveType)) {
          const uriIssue = validateUriFormat(value, path, resourceType, profileUrl);
          if (uriIssue) {
            issues.push(uriIssue);
          }
        }

        if (typeof value === 'string') {
          const formatIssue = this.validatePrimitiveStringFormat(value, effectiveType, path, profileUrl);
          if (formatIssue) {
            issues.push(formatIssue);
          }
        }

        break;
      }
    }

    // Non-polymorphic slot fallback: the per-type isX() heuristics exist to
    // disambiguate value[x] choice types. When the schema declares exactly
    // one complex type, a plain object should be accepted structurally —
    // field-level validators catch truly wrong shapes (unknown properties,
    // cardinality). This prevents false positives like Patient.example's
    // telecom[0] = {use: "home"} being misreported as HumanName because
    // `use` is a shared field across several FHIR datatypes.
    if (!matchedType && effectiveTypes.length === 1) {
      const typeCode = effectiveTypes[0].code;
      const effectiveType = normalizeFhirType(typeCode) || typeCode;
      const isPlainObject = typeof value === 'object' && value !== null && !Array.isArray(value);
      if (isPlainObject && !PRIMITIVE_TYPE_CODES.has(effectiveType)) {
        matchedType = true;
      }
    }

    // If no type matched, add error
    if (!matchedType) {
      // Special case: dateTime/instant without timezone
      const hasDateTimeType = effectiveTypes.some(t => t.code === 'dateTime' || t.code === 'instant');
      if (hasDateTimeType && typeof value === 'string' && value.includes('T') && !/[Z+-]/.test(value.split('T')[1] || '')) {
        issues.push(createValidationIssue({
          code: 'structural-invalid-format',
          path,
          resourceType,
          profile: profileUrl,
          customMessage: 'If a date has a time, it must have a timezone',
          severityOverride: 'error',
          details: buildDateTimeFormatDetails(value, 'dateTime'),
        }));
      } else {
        const typeDescriptions = effectiveTypes.map(t => getTypeDescription(t.code));
        const expectedTypes = typeDescriptions.join(' | ');
        const actualType = getActualFhirType(value);
        const primitiveOnly = effectiveTypes.every(type => {
          const normalized = normalizeFhirType(type.code) || type.code;
          return PRIMITIVE_TYPE_CODES.has(normalized);
        });

        issues.push(createValidationIssue({
          code: primitiveOnly
            ? 'structural-primitive-type-mismatch'
            : 'structural-type-mismatch',
          path,
          resourceType,
          profile: profileUrl,
          messageParams: { element: path, expected: expectedTypes, actual: actualType },
        }));
      }
    }

    // Whitespace-only primitive check moved to
    // StructuralExecutor.validateWhitespaceOnlyPrimitives so it runs
    // in both full-validate and lightweight validateStructure paths.

    return issues;
  }

  /**
   * Check if value matches a FHIR type
   * 
   * Handles type codes from different type systems:
   * - FHIR primitives: 'string', 'integer', 'boolean', etc.
   * - FHIRPath types: 'http://hl7.org/fhirpath/System.String', etc.
   * - Complex types: 'CodeableConcept', 'Reference', etc.
   */
  private async matchesType(value: any, typeCode: string): Promise<boolean> {
    const normalizedType = normalizeFhirType(typeCode);
    const effectiveType = normalizedType || typeCode;

    if (isResolvedPrimitiveSidecarValue(value) && PRIMITIVE_TYPE_CODES.has(effectiveType)) {
      const primitiveSidecarType = getResolvedPrimitiveSidecarType(value);
      return primitiveSidecarType ? primitiveSidecarType === effectiveType : true;
    }

    if (isExtensionOnly(value) && !PRIMITIVE_TYPE_CODES.has(effectiveType)) {
      return true;
    }

    const primitiveMatch = matchesPrimitiveType(value, effectiveType);
    if (primitiveMatch !== null) {
      return primitiveMatch;
    }

    return matchesComplexType(value, effectiveType);
  }

  private validatePrimitiveStringFormat(
    value: string,
    effectiveType: string,
    path: string,
    profileUrl?: string,
  ): ValidationIssue | null {
    switch (effectiveType) {
      case 'date':
        return isValidFhirDate(value)
          ? null
          : this.createInvalidFormatIssue(path, profileUrl, `Invalid date format: ${formatInvalidValueForMessage(value)}`, value, 'date');
      case 'dateTime':
      case 'instant':
        if (value.includes('T') && !/[Z+-]/.test(value.split('T')[1] || '')) {
          return this.createInvalidFormatIssue(path, profileUrl, 'If a date has a time, it must have a timezone', value, effectiveType);
        }
        return isValidFhirDateTime(value)
          ? null
          : this.createInvalidFormatIssue(path, profileUrl, `Invalid ${effectiveType} format: ${formatInvalidValueForMessage(value)}`, value, effectiveType);
      case 'time':
        return /^([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?$/.test(value)
          ? null
          : this.createInvalidFormatIssue(path, profileUrl, `Invalid time format: ${formatInvalidValueForMessage(value)}`, value, 'time');
      case 'base64Binary':
        return isValidBase64Binary(value)
          ? null
          : this.createInvalidFormatIssue(
            path,
            profileUrl,
            `Invalid base64Binary format at ${path}`,
            value,
            'base64Binary',
            'structural-invalid-base64-format',
          );
      default:
        return null;
    }
  }

  private createInvalidFormatIssue(
    path: string,
    profileUrl: string | undefined,
    message: string,
    value: string,
    expectedType: string,
    code: string = 'structural-invalid-format',
  ): ValidationIssue {
    return createValidationIssue({
      code,
      path,
      resourceType: inferResourceTypeFromPath(path),
      profile: profileUrl,
      customMessage: message,
      severityOverride: 'error',
      details: expectedType === 'dateTime' || expectedType === 'instant'
        ? buildDateTimeFormatDetails(value, expectedType)
        : buildInvalidPrimitiveFormatDetails(value, expectedType),
    });
  }
}

function inferResourceTypeFromPath(path: string): string {
  return normalizeResourceType('Unknown', path);
}

function narrowTypesForConcreteChoicePath(types: ElementType[], path: string): ElementType[] {
  if (!types || types.length <= 1) return types;
  const lastSegment = path.split('.').pop()?.replace(/\[\d+\]$/, '');
  if (!lastSegment || lastSegment.endsWith('[x]')) return types;

  const matched = types.find(type => {
    const suffix = choiceSuffixForType(type.code);
    if (!suffix || lastSegment.length <= suffix.length) return false;
    return lastSegment.endsWith(suffix);
  });

  return matched ? [matched] : types;
}

function choiceSuffixForType(typeCode: string): string | null {
  const effectiveType = normalizeFhirType(typeCode) || typeCode;
  if (!effectiveType) return null;
  if (effectiveType === 'SimpleQuantity') return 'Quantity';
  return effectiveType.charAt(0).toUpperCase() + effectiveType.slice(1);
}

function buildDateTimeFormatDetails(value: string, expectedType: string): Record<string, unknown> {
  const suggestedValue = suggestFhirDateTime(value);
  return {
    value,
    expectedType,
    ...(suggestedValue ? { suggestedValue } : {}),
    fixHint: suggestedValue
      ? `Replace '${value}' with '${suggestedValue}' or another valid FHIR ${expectedType} value with required seconds and timezone.`
      : `Use a valid FHIR ${expectedType}: include seconds when a time is present and include a timezone (Z or +/-HH:MM).`,
  };
}

function buildInvalidPrimitiveFormatDetails(value: string, expectedType: string): Record<string, unknown> {
  if (value.length <= INVALID_FORMAT_VALUE_PREVIEW_LIMIT) {
    return {
      value,
      expectedType,
      fixHint: `Replace '${value}' with a valid FHIR ${expectedType} value.`,
    };
  }

  return {
    expectedType,
    valuePreview: truncateInvalidFormatValue(value),
    valueLength: value.length,
    valueTruncated: true,
    fixHint: `Replace this value with a valid FHIR ${expectedType} value. The current value is ${value.length} characters and was truncated in this report.`,
  };
}

function formatInvalidValueForMessage(value: string): string {
  return value.length <= INVALID_FORMAT_VALUE_PREVIEW_LIMIT
    ? `'${value}'`
    : `'${truncateInvalidFormatValue(value)}' (${value.length} characters)`;
}

function truncateInvalidFormatValue(value: string): string {
  if (value.length <= INVALID_FORMAT_VALUE_PREVIEW_LIMIT) return value;
  return `${value.slice(0, INVALID_FORMAT_VALUE_PREVIEW_LIMIT)}...`;
}

function suggestFhirDateTime(value: string): string | undefined {
  const missingSeconds = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/);
  if (missingSeconds) {
    return `${missingSeconds[1]}:00${missingSeconds[2]}`;
  }

  const trailingComma = value.match(/^(.+)(Z|[+-]\d{2}:\d{2}),$/);
  if (trailingComma) {
    return `${trailingComma[1]}${trailingComma[2]}`;
  }

  if (value.includes('T') && !/[Z+-]/.test(value.split('T')[1] || '')) {
    return `${value}Z`;
  }

  return undefined;
}

function isValidFhirDate(value: string): boolean {
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return false;
  return hasValidCalendarDay(value);
}

function isValidFhirDateTime(value: string): boolean {
  const fhirDateTimeRe = /^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/;
  if (!fhirDateTimeRe.test(value)) return false;
  return hasValidCalendarDay(value);
}

function hasValidCalendarDay(value: string): boolean {
  const dayMatch = value.match(/^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])/);
  if (!dayMatch) return true;

  const [, y, m, d] = dayMatch;
  const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return dt.getUTCFullYear() === Number(y)
    && (dt.getUTCMonth() + 1) === Number(m)
    && dt.getUTCDate() === Number(d);
}

function isValidBase64Binary(value: string): boolean {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  if (value.length % 4 !== 0) return false;
  const paddingIndex = value.indexOf('=');
  return paddingIndex === -1 || /^=+$/.test(value.slice(paddingIndex));
}
