import { describe, expect, it } from 'vitest';
import type { StructureDefinition } from '../../core/structure-definition-types';
import { SlicingValidator } from '../slicing-validator';

describe('optional fixed slice children', () => {
  it('does not require an optional fixed child', async () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/optional-fixed-child',
      name: 'OptionalFixedChild',
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
              rules: 'open',
            },
          } as any,
          {
            id: 'Patient.identifier:test',
            path: 'Patient.identifier',
            sliceName: 'test',
            min: 0,
            max: '1',
            patternIdentifier: { system: 'http://example.org/id' },
          } as any,
          {
            id: 'Patient.identifier:test.use',
            path: 'Patient.identifier.use',
            min: 0,
            max: '1',
            fixedCode: 'official',
          } as any,
        ],
      },
    };

    const issues = await new SlicingValidator().validateSlicing(
      [{ system: 'http://example.org/id', value: '123' }],
      'Patient.identifier',
      profile,
    );

    expect(issues.filter(issue => issue.path?.endsWith('.use'))).toHaveLength(0);
  });

  it('does not require nested children below an absent optional ancestor', async () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/optional-ancestor',
      name: 'OptionalAncestor',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Practitioner',
      snapshot: {
        element: [
          {
            id: 'Practitioner.identifier',
            path: 'Practitioner.identifier',
            slicing: {
              discriminator: [{ type: 'value', path: 'system' }],
              rules: 'open',
            },
          } as any,
          {
            id: 'Practitioner.identifier:lanr',
            path: 'Practitioner.identifier',
            sliceName: 'lanr',
            min: 0,
            max: '1',
            patternIdentifier: { system: 'http://example.org/lanr' },
          } as any,
          {
            id: 'Practitioner.identifier:lanr.assigner',
            path: 'Practitioner.identifier.assigner',
            min: 0,
          } as any,
          {
            id: 'Practitioner.identifier:lanr.assigner.identifier.system',
            path: 'Practitioner.identifier.assigner.identifier.system',
            min: 1,
          } as any,
          {
            id: 'Practitioner.identifier:lanr.assigner.identifier.value',
            path: 'Practitioner.identifier.assigner.identifier.value',
            min: 1,
          } as any,
          {
            id: 'Practitioner.identifier:lanr.assigner.display',
            path: 'Practitioner.identifier.assigner.display',
            min: 1,
          } as any,
        ],
      },
    };

    const issues = await new SlicingValidator().validateSlicing(
      [{ system: 'http://example.org/lanr', value: '123456789' }],
      'Practitioner.identifier',
      profile,
    );

    expect(issues.filter(issue => issue.code === 'structural-cardinality-min')).toEqual([]);
  });
});
