import { describe, expect, it } from 'vitest';
import { ReferenceValidator } from './reference-validator-refactored';
import { normalizeReferenceValidationArgs } from './reference-validation-args';

describe('reference validation argument boundaries', () => {
  it('accepts only supported FHIR version strings', () => {
    expect(normalizeReferenceValidationArgs('R5')).toMatchObject({ fhirVersion: 'R5' });
    expect(normalizeReferenceValidationArgs('R7')).toMatchObject({ fhirVersion: 'R4' });
  });

  it('validates non-object input without reading identity fields', async () => {
    const result = await new ReferenceValidator().validate(42, {
      resource: 42,
      resourceType: 'Unknown',
      resourceId: undefined,
      fhirVersion: 'R4',
    });

    expect(result).toMatchObject({
      resourceId: 'unknown',
      resourceType: 'Unknown',
      isValid: true,
      issues: [],
    });
  });
});
