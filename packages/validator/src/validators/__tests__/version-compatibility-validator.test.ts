import { describe, expect, it } from 'vitest';
import { VersionCompatibilityValidator } from '../version-compatibility-validator';

describe('VersionCompatibilityValidator', () => {
  it('ignores malformed resource inputs safely', () => {
    const validator = new VersionCompatibilityValidator();

    expect(validator.validate(null)).toEqual([]);
    expect(validator.validate([])).toEqual([]);
    expect(validator.validate({ resourceType: 42 })).toEqual([]);
    expect(validator.detectVersion({ meta: { profile: 'not-an-array' } })).toEqual({
      detected: 'R4',
      confidence: 'low',
      hints: [],
    });
  });

  it('detects an R6 profile from a well-formed meta.profile array', () => {
    const validator = new VersionCompatibilityValidator();

    expect(validator.detectVersion({
      resourceType: 'Patient',
      meta: { profile: ['https://hl7.org/fhir/6.0/StructureDefinition/Patient'] },
    })).toEqual({
      detected: 'R6',
      confidence: 'high',
      hints: ['Profile URL indicates R6'],
    });
  });

  it('keeps the highest detected version regardless of profile order', () => {
    const validator = new VersionCompatibilityValidator();

    expect(validator.detectVersion({
      resourceType: 'Patient',
      meta: {
        profile: [
          'https://hl7.org/fhir/6.0/StructureDefinition/Patient',
          'https://hl7.org/fhir/5.0/StructureDefinition/Patient',
        ],
      },
    })).toMatchObject({ detected: 'R6', confidence: 'high' });
  });

  it('detects R5 CodeableReference medication structure', () => {
    const validator = new VersionCompatibilityValidator();

    expect(validator.detectVersion({
      resourceType: 'MedicationRequest',
      medication: { concept: { text: 'Aspirin' } },
    })).toEqual({
      detected: 'R5',
      confidence: 'medium',
      hints: ['MedicationRequest.medication uses CodeableReference (R5+)'],
    });
  });
});
