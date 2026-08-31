import { describe, expect, it } from 'vitest';

import type { StructureDefinition } from '../../core/structure-definition-types';
import { ReferenceTargetValidator } from '../reference-target-validator';

describe('ReferenceTargetValidator EPS target profiles', () => {
  it('recognizes a delimiter-qualified lowercase patient profile before it is cached', () => {
    const validator = new ReferenceTargetValidator();
    const profile = {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.eu/fhir/eps/StructureDefinition/composition-eu-eps',
      type: 'Composition',
      snapshot: {
        element: [{
          id: 'Composition.subject',
          path: 'Composition.subject',
          type: [{
            code: 'Reference',
            targetProfile: [
              'http://hl7.eu/fhir/eps/StructureDefinition/patient-eu-eps|1.0.0-ballot',
            ],
          }],
        }],
      },
    } as StructureDefinition;

    const issues = validator.validate(
      { resourceType: 'Composition', subject: { reference: 'urn:uuid:organization' } },
      profile,
      () => ({ resourceType: 'Organization', id: 'organization' }),
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'reference-target-type-invalid',
      path: 'Composition.subject',
      details: expect.objectContaining({
        actualTarget: 'Organization',
        allowedTargets: ['Patient'],
      }),
    }));
  });

  it('prefers resolved profile metadata over a token in an unusual profile id', () => {
    const validator = new ReferenceTargetValidator();
    validator.setProfileTypeResolver(
      canonical => canonical.endsWith('/patient-observation') ? 'Patient' : null,
    );
    const profile = {
      resourceType: 'StructureDefinition',
      url: 'http://example.test/StructureDefinition/composition',
      type: 'Composition',
      snapshot: {
        element: [{
          id: 'Composition.subject',
          path: 'Composition.subject',
          type: [{
            code: 'Reference',
            targetProfile: ['http://example.test/StructureDefinition/patient-observation'],
          }],
        }],
      },
    } as StructureDefinition;

    const issues = validator.validate(
      { resourceType: 'Composition', subject: { reference: 'Patient/example' } },
      profile,
    );

    expect(issues).toEqual([]);
  });

  it('does not infer a target type from an interior profile-id token', () => {
    const validator = new ReferenceTargetValidator();
    const profile = {
      resourceType: 'StructureDefinition',
      url: 'https://example.test/StructureDefinition/pathology-list',
      type: 'List',
      snapshot: {
        element: [{
          id: 'List.entry.item',
          path: 'List.entry.item',
          type: [{
            code: 'Reference',
            targetProfile: [
              'https://www.medizininformatik-initiative.de/fhir/ext/modul-patho/StructureDefinition/mii-pr-patho-problem-list-item',
            ],
          }],
        }],
      },
    } as StructureDefinition;

    const issues = validator.validate(
      {
        resourceType: 'List',
        entry: [{ item: { reference: 'Condition/example' } }],
      },
      profile,
    );

    expect(issues).toEqual([]);
  });
});
