import { describe, expect, it } from 'vitest';
import { MustSupportValidator } from '../must-support-validator';

describe('MustSupportValidator', () => {
  const validator = new MustSupportValidator();

  it('skips deep mustSupport children when their optional parent is absent', () => {
    const resource = {
      resourceType: 'ValueSet',
      compose: {
        include: [{
          system: 'http://loinc.org',
          concept: [{ code: 'LA2-8', display: 'Male' }],
        }],
      },
    };

    const issues = validator.validateMustSupportElement(
      'ValueSet.compose.include.filter.op',
      'http://hl7.org/fhir/us/sdc/StructureDefinition/sdc-valueset',
      resource,
    );

    expect(issues).toHaveLength(0);
  });

  it('skips optional mustSupport on conformance resources', () => {
    const resource = {
      resourceType: 'ValueSet',
      compose: {
        include: [{ system: 'http://loinc.org' }],
      },
    };

    const issues = validator.validateMustSupportElement(
      'ValueSet.date',
      'http://hl7.org/fhir/us/sdc/StructureDefinition/sdc-valueset',
      resource,
    );

    expect(issues).toHaveLength(0);
  });

  it('still reports direct mustSupport elements on data resources when their parent exists', () => {
    const resource = {
      resourceType: 'Patient',
    };

    const issues = validator.validateMustSupportElement(
      'Patient.identifier',
      'http://example.org/StructureDefinition/patient',
      resource,
    );

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'profile-mustsupport-missing', path: 'Patient.identifier' }),
    ]));
  });

  it('does not treat empty malformed arrays as encounter reason context', () => {
    const issues = validator.validateMustSupportElement(
      'Encounter.reasonCode',
      'http://example.org/StructureDefinition/encounter',
      {
        resourceType: 'Encounter',
        type: [null, {}],
        diagnosis: [],
      },
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-mustsupport-missing',
        path: 'Encounter.reasonCode',
      }),
    ]);
  });

  it('handles malformed component entries without throwing', () => {
    const issues = validator.validateMustSupportElement(
      'Observation.component.value[x]',
      'http://example.org/StructureDefinition/observation',
      {
        resourceType: 'Observation',
        component: [null, 42, {}],
      },
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-mustsupport-missing',
        path: 'Observation.component.value[x]',
      }),
    ]);
  });

  it('reports malformed resources without throwing', () => {
    const issues = validator.validateMustSupportElement(
      'Patient.identifier',
      'http://example.org/StructureDefinition/patient',
      null,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'profile-mustsupport-missing',
        path: 'Patient.identifier',
      }),
    ]);
  });
});
