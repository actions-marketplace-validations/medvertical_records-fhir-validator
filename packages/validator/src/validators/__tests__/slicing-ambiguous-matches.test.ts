/**
 * Multi-slice ambiguity parity tests (HL7 Java validator behaviour): when
 * sibling reslices share identical discriminator evidence, an element
 * matching them cannot be attributed and must produce "matches more than
 * one slice" errors instead of content mismatches against an arbitrary slice.
 */

import { describe, expect, it } from 'vitest';
import { SlicingValidator } from '../slicing-validator';
import type { StructureDefinition } from '../../core/structure-definition-types';

const OTHER_ID_URL = 'https://profiles.ihe.net/ITI/BALP/StructureDefinition/ihe-otherId';

function buildResliceProfile(npiUrl: string = OTHER_ID_URL): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: 'https://profiles.ihe.net/ITI/BALP/StructureDefinition/IHE.BasicAudit.SAMLaccessTokenUse.Comprehensive',
    name: 'SamlComprehensiveTest',
    type: 'AuditEvent',
    status: 'active',
    kind: 'resource',
    abstract: false,
    snapshot: {
      element: [
        {
          id: 'AuditEvent.agent:user.extension',
          path: 'AuditEvent.agent.extension',
          min: 0,
          max: '*',
          slicing: {
            discriminator: [{ type: 'value', path: 'url' }],
            rules: 'open',
            ordered: false,
          },
        },
        {
          id: 'AuditEvent.agent:user.extension:otherId',
          path: 'AuditEvent.agent.extension',
          sliceName: 'otherId',
          min: 0,
          max: '*',
          type: [{ code: 'Extension', profile: [OTHER_ID_URL] }],
        },
        {
          id: 'AuditEvent.agent:user.extension:otherId/subject-id',
          path: 'AuditEvent.agent.extension',
          sliceName: 'otherId/subject-id',
          min: 0,
          max: '*',
          type: [{ code: 'Extension', profile: [OTHER_ID_URL] }],
        },
        {
          id: 'AuditEvent.agent:user.extension:otherId/subject-id.url',
          path: 'AuditEvent.agent.extension.url',
          min: 1,
          max: '1',
          fixedUri: OTHER_ID_URL,
        },
        {
          id: 'AuditEvent.agent:user.extension:otherId/npi',
          path: 'AuditEvent.agent.extension',
          sliceName: 'otherId/npi',
          min: 0,
          max: '*',
          type: [{ code: 'Extension', profile: [npiUrl] }],
        },
        {
          id: 'AuditEvent.agent:user.extension:otherId/npi.url',
          path: 'AuditEvent.agent.extension.url',
          min: 1,
          max: '1',
          fixedUri: npiUrl,
        },
      ],
    },
  };
}

function otherIdExtension(typeCode: string): Record<string, unknown> {
  return {
    url: OTHER_ID_URL,
    valueIdentifier: {
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: typeCode }] },
      value: `id-${typeCode}`,
    },
  };
}

describe('ambiguous multi-slice matches', () => {
  const validator = new SlicingValidator();

  it('reports Java-parity ambiguity errors when reslices share identical discriminator evidence', async () => {
    const elements = [otherIdExtension('NPI'), otherIdExtension('PRN')];

    const issues = await validator.validateSlicing(
      elements,
      'AuditEvent.agent.extension',
      buildResliceProfile(),
      undefined,
      'AuditEvent.agent:user.extension',
    );

    const ambiguity = issues.filter(issue => issue.code === 'profile-slice-ambiguous-match');
    expect(ambiguity).toHaveLength(2);
    for (const [index, issue] of ambiguity.entries()) {
      expect(issue.severity).toBe('error');
      expect(issue.path).toBe(`AuditEvent.agent.extension[${index}]`);
      expect(issue.message).toBe(
        'Element matches more than one slice - otherId/subject-id, otherId/npi',
      );
    }
  });

  it('stays silent when reslice discriminator evidence differs', async () => {
    const distinguishable = buildResliceProfile('https://example.org/fhir/StructureDefinition/npi-id');

    const issues = await validator.validateSlicing(
      [otherIdExtension('NPI')],
      'AuditEvent.agent.extension',
      distinguishable,
      undefined,
      'AuditEvent.agent:user.extension',
    );

    expect(issues.filter(issue => issue.code === 'profile-slice-ambiguous-match')).toHaveLength(0);
  });

  it('treats a reslice and its parent slice as hierarchy, not ambiguity', async () => {
    const profile = buildResliceProfile();
    profile.snapshot!.element = profile.snapshot!.element!.filter(element =>
      !String(element.id).includes('otherId/npi'),
    );

    const issues = await validator.validateSlicing(
      [otherIdExtension('NPI')],
      'AuditEvent.agent.extension',
      profile,
      undefined,
      'AuditEvent.agent:user.extension',
    );

    expect(issues.filter(issue => issue.code === 'profile-slice-ambiguous-match')).toHaveLength(0);
  });

  it('does not flag ordinary sibling slices whose distinct patterns overlap on one element', async () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/overlap-test',
      name: 'OverlapTest',
      type: 'Observation',
      status: 'active',
      kind: 'resource',
      abstract: false,
      snapshot: {
        element: [
          {
            id: 'Observation.category',
            path: 'Observation.category',
            slicing: {
              discriminator: [{ type: 'pattern', path: '$this' }],
              rules: 'open',
            },
          },
          {
            id: 'Observation.category:byCode',
            path: 'Observation.category',
            sliceName: 'byCode',
            min: 0,
            max: '*',
            patternCodeableConcept: { coding: [{ code: 'vital-signs' }] },
          },
          {
            id: 'Observation.category:bySystem',
            path: 'Observation.category',
            sliceName: 'bySystem',
            min: 0,
            max: '*',
            patternCodeableConcept: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category' }],
            },
          },
        ],
      },
    };
    // The element satisfies both patterns, but the patterns themselves differ,
    // so the discriminator can still separate correctly authored instances.
    const element = {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
      }],
    };

    const issues = await validator.validateSlicing(
      [element],
      'Observation.category',
      profile,
    );

    expect(issues.filter(issue => issue.code === 'profile-slice-ambiguous-match')).toHaveLength(0);
  });
});
