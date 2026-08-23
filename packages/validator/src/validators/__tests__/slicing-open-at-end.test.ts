import { describe, expect, it } from 'vitest';
import type { SlicingDefinition, StructureDefinition } from '../../core/structure-definition-types';
import { SlicingValidator } from '../slicing-validator';

const OFFICIAL_SYSTEM = 'urn:identifier:official';
const ADDITIONAL_SYSTEM = 'urn:identifier:additional';

function patientIdentifierProfile(rules: SlicingDefinition['rules']): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: `http://example.org/StructureDefinition/patient-identifiers-${rules}`,
    name: 'PatientIdentifierSlicing',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
    snapshot: {
      element: [
        {
          id: 'Patient.identifier',
          path: 'Patient.identifier',
          min: 0,
          max: '*',
          slicing: {
            discriminator: [{ type: 'value', path: 'system' }],
            rules,
            ordered: false,
          },
        },
        {
          id: 'Patient.identifier:official',
          path: 'Patient.identifier',
          sliceName: 'official',
          min: 0,
          max: '*',
          pattern: { system: OFFICIAL_SYSTEM },
        },
      ],
    },
  };
}

describe('SlicingValidator openAtEnd ordering', () => {
  const validator = new SlicingValidator();

  it('accepts unmatched content after all named slices', async () => {
    const issues = await validator.validateSlicing(
      [
        { system: OFFICIAL_SYSTEM, value: 'known' },
        { system: ADDITIONAL_SYSTEM, value: 'additional' },
      ],
      'Patient.identifier',
      patientIdentifierProfile('openAtEnd'),
    );

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'profile-slice-ordering-violation',
    }));
  });

  it('rejects a named slice after unmatched content', async () => {
    const issues = await validator.validateSlicing(
      [
        { system: ADDITIONAL_SYSTEM, value: 'additional' },
        { system: OFFICIAL_SYSTEM, value: 'known' },
      ],
      'Patient.identifier',
      patientIdentifierProfile('openAtEnd'),
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-slice-ordering-violation',
      details: expect.objectContaining({
        reason: 'known-slice-after-open-at-end-content',
        sliceName: 'official',
      }),
    }));
  });

  it('still permits unmatched content before a named slice for open slicing', async () => {
    const issues = await validator.validateSlicing(
      [
        { system: ADDITIONAL_SYSTEM, value: 'additional' },
        { system: OFFICIAL_SYSTEM, value: 'known' },
      ],
      'Patient.identifier',
      patientIdentifierProfile('open'),
    );

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'profile-slice-ordering-violation',
    }));
  });
});
