import { describe, expect, it } from 'vitest';
import { inferCodeBasedProfiles, matchCodeInferredProfile } from './code-inferred-profiles';

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

describe('matchCodeInferredProfile', () => {
  it('reports the triggering coding alongside the implied profile', () => {
    expect(matchCodeInferredProfile({
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
    })).toEqual({
      profileUrl: 'http://hl7.org/fhir/StructureDefinition/bp',
      system: 'http://loinc.org',
      code: '8480-6',
    });
  });

  it('does not infer bp from the diastolic-only code 8462-4, matching the reference table', () => {
    // Deliberate upstream parity: the HL7 implied-profiles table lists the
    // systolic code 8480-6 but not the diastolic 8462-4.
    expect(matchCodeInferredProfile({
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
    })).toBeNull();
  });

  it('stays aligned with inferCodeBasedProfiles for non-Observation resources', () => {
    const patient = { resourceType: 'Patient' };
    expect(matchCodeInferredProfile(patient)).toBeNull();
    expect(inferCodeBasedProfiles(patient)).toEqual([]);
  });
});
