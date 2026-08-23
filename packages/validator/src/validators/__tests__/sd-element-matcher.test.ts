import { describe, expect, it } from 'vitest';
import { SDElementMatcher } from '../sd-element-matcher';

const sdElementMatcher = new SDElementMatcher();
import type { StructureDefinition } from '../../core/structure-definition-types';

describe('SDElementMatcher', () => {
  it('does not apply slice-scoped fixed values as global element rules', () => {
    const structureDef: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/PractitionerRoleProfile',
      name: 'PractitionerRoleProfile',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'PractitionerRole',
      snapshot: {
        element: [
          { id: 'PractitionerRole', path: 'PractitionerRole' },
          { id: 'PractitionerRole.extension', path: 'PractitionerRole.extension' },
          { id: 'PractitionerRole.extension.url', path: 'PractitionerRole.extension.url' },
          {
            id: 'PractitionerRole.extension:qualification',
            path: 'PractitionerRole.extension',
            sliceName: 'qualification',
          },
          {
            id: 'PractitionerRole.extension:qualification.url',
            path: 'PractitionerRole.extension.url',
            fixedUri: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/qualification',
          },
        ],
      },
    } as any;

    const resource = {
      resourceType: 'PractitionerRole',
      extension: [
        { url: 'http://example.org/other-extension' },
      ],
    };

    const result = sdElementMatcher.match(resource, structureDef);
    const urlMatch = result.matches.find(match => match.resourcePath === 'PractitionerRole.extension.url');

    expect(urlMatch?.element.fixedUri).toBeUndefined();
  });

  it('reports unmatched paths while retaining later valid matches', () => {
    const structureDef: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Patient',
      name: 'Patient',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { id: 'Patient', path: 'Patient' },
          { id: 'Patient.active', path: 'Patient.active' },
        ],
      },
    };
    const resource = {
      resourceType: 'Patient',
      extra: 'unknown',
      active: true,
    };

    const result = sdElementMatcher.match(resource, structureDef);

    expect(result.unmatchedPaths).toContain('Patient.extra');
    expect(result.matches).toContainEqual(expect.objectContaining({
      resourcePath: 'Patient.active',
      data: true,
    }));
  });

  it('terminates cyclic branches and still evaluates their siblings', () => {
    const structureDef: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Patient',
      name: 'Patient',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { id: 'Patient', path: 'Patient' },
          { id: 'Patient.active', path: 'Patient.active' },
        ],
      },
    };
    const resource: Record<string, unknown> = { resourceType: 'Patient' };
    resource.loop = resource;
    resource.active = true;

    const result = sdElementMatcher.match(resource, structureDef);

    expect(result.matches).toContainEqual(expect.objectContaining({
      resourcePath: 'Patient.active',
      data: true,
    }));
  });

  it('rejects non-resource inputs at the public boundary', () => {
    const structureDef = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Patient',
      name: 'Patient',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: { element: [{ id: 'Patient', path: 'Patient' }] },
    } satisfies StructureDefinition;

    expect(sdElementMatcher.match(null, structureDef).matches).toEqual([]);
    expect(sdElementMatcher.match({ resourceType: 42 }, structureDef).matches).toEqual([]);
  });

  it('uses the profile type for datatype instances without resourceType', () => {
    const structureDef = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Extension',
      name: 'Extension',
      status: 'draft',
      kind: 'complex-type',
      abstract: false,
      type: 'Extension',
      snapshot: {
        element: [
          { id: 'Extension', path: 'Extension' },
          { id: 'Extension.url', path: 'Extension.url' },
        ],
      },
    } satisfies StructureDefinition;

    const result = sdElementMatcher.match({ url: 'http://example.org/ext' }, structureDef);

    expect(result.matches).toContainEqual(expect.objectContaining({
      resourcePath: 'Extension.url',
      data: 'http://example.org/ext',
    }));
  });

  it('matches choice bases that were absent from the legacy hardcoded list', () => {
    const structureDef = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/MeasureReport',
      name: 'MeasureReport',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'MeasureReport',
      snapshot: {
        element: [
          { id: 'MeasureReport', path: 'MeasureReport' },
          { id: 'MeasureReport.subject[x]', path: 'MeasureReport.subject[x]' },
        ],
      },
    } satisfies StructureDefinition;
    const subject = { reference: 'Patient/example' };

    const result = sdElementMatcher.match({
      resourceType: 'MeasureReport',
      subjectReference: subject,
    }, structureDef);

    expect(result.matches).toContainEqual(expect.objectContaining({
      resourcePath: 'MeasureReport.subjectReference',
      data: subject,
    }));
  });
});
