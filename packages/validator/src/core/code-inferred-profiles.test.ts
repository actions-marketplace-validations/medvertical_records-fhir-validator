import { describe, expect, it } from 'vitest';
import { inferCodeBasedProfiles } from './code-inferred-profiles';

describe('inferCodeBasedProfiles', () => {
  it.each([
    ['29463-7', 'bodyweight'],
    ['8302-2', 'bodyheight'],
    ['8329-5', 'bodytemp'],
    ['85354-9', 'bp'],
    ['59408-5', 'oxygensat'],
  ])('infers the core %s Observation profile', (code, profileId) => {
    expect(inferCodeBasedProfiles({
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code }] },
    })).toEqual([`http://hl7.org/fhir/StructureDefinition/${profileId}`]);
  });

  it('supports the reference validator SNOMED CT inference table', () => {
    expect(inferCodeBasedProfiles({
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '60621009' }] },
    })).toEqual(['http://hl7.org/fhir/StructureDefinition/bmi']);
  });

  it('does not infer from a code in another system', () => {
    expect(inferCodeBasedProfiles({
      resourceType: 'Observation',
      code: { coding: [{ system: 'https://example.org/local', code: '29463-7' }] },
    })).toEqual([]);
  });

  it('uses the same first-match priority as the reference validator', () => {
    expect(inferCodeBasedProfiles({
      resourceType: 'Observation',
      code: {
        coding: [
          { system: 'http://loinc.org', code: '29463-7' },
          { system: 'http://loinc.org', code: '8310-5' },
        ],
      },
    })).toEqual(['http://hl7.org/fhir/StructureDefinition/bodytemp']);
  });
});
