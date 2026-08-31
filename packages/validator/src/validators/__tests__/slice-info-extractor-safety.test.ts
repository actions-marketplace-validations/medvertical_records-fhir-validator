import { describe, expect, it, vi } from 'vitest';

import type {
  ElementDefinition,
  StructureDefinition,
} from '../../core/structure-definition-types';
import { extractSlicingInfo } from '../slice-info-extractor';

function profile(
  snapshotElements: unknown[],
  differentialElements: unknown[] = [],
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    id: 'test',
    url: 'https://example.test/StructureDefinition/Test',
    name: 'Test',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
    snapshot: { element: snapshotElements as ElementDefinition[] },
    differential: { element: differentialElements as ElementDefinition[] },
  };
}

describe('slice info extractor safety', () => {
  it('falls back to differential elements when snapshot is empty', async () => {
    const result = await extractSlicingInfo(
      'Patient.identifier',
      profile([], [
        {
          id: 'Patient.identifier',
          path: 'Patient.identifier',
          slicing: {
            discriminator: [{ type: 'value', path: 'system' }],
            rules: 'open',
          },
        },
        {
          id: 'Patient.identifier:mrn',
          path: 'Patient.identifier',
          sliceName: 'mrn',
          fixedIdentifier: { system: 'https://example.test/mrn' },
        },
      ]),
      null,
      null,
    );

    expect(result?.slices).toEqual([
      expect.objectContaining({
        sliceName: 'mrn',
        fixed: { system: 'https://example.test/mrn' },
      }),
    ]);
  });

  it('keeps inferred slices inside an explicit slicing element scope', async () => {
    const result = await extractSlicingInfo(
      'Patient.identifier',
      profile([], [
        {
          id: 'Patient.identifier:official:mrn',
          path: 'Patient.identifier',
          sliceName: 'mrn',
          fixedIdentifier: { system: 'https://example.test/mrn' },
        },
        {
          id: 'Patient.identifier:secondary:ssn',
          path: 'Patient.identifier',
          sliceName: 'ssn',
          fixedIdentifier: { system: 'https://example.test/ssn' },
        },
      ]),
      null,
      null,
      'Patient.identifier:official',
    );

    expect(result?.slices.map(slice => slice.sliceName)).toEqual(['mrn']);
  });

  it('does not treat fixedBoolean false as a missing root constraint', async () => {
    const loadValueSet = vi.fn().mockResolvedValue(['yes', 'no']);
    const result = await extractSlicingInfo(
      'Patient.active',
      profile([
        {
          id: 'Patient.active',
          path: 'Patient.active',
          slicing: {
            discriminator: [{ type: 'value', path: '$this' }],
            rules: 'open',
          },
        },
        {
          id: 'Patient.active:inactive',
          path: 'Patient.active',
          sliceName: 'inactive',
          fixedBoolean: false,
          binding: {
            strength: 'required',
            valueSet: 'https://example.test/ValueSet/boolean',
          },
        },
      ]),
      null,
      { loadValueSet },
    );

    expect(result?.slices[0].fixed).toBe(false);
    expect(loadValueSet).not.toHaveBeenCalled();
  });

  it('skips malformed elements and normalizes malformed slicing metadata', async () => {
    const result = await extractSlicingInfo(
      'Patient.identifier',
      profile([
        null,
        42,
        { path: Symbol('Patient.identifier') },
        {
          id: 'Patient.identifier',
          path: 'Patient.identifier',
          slicing: {
            discriminator: {},
            rules: Symbol('open'),
          },
        },
        {
          id: 'Patient.identifier:mrn',
          path: 'Patient.identifier',
          sliceName: 'mrn',
          type: [{ code: Symbol('Identifier') }],
        },
      ]),
      null,
      null,
    );

    expect(result).toMatchObject({
      slicing: {
        discriminator: undefined,
        rules: undefined,
      },
      slices: [{
        sliceName: 'mrn',
        type: [],
      }],
    });
  });

  it('ignores malformed ValueSet loader results instead of splitting strings', async () => {
    const loader = {
      loadValueSet: vi.fn().mockResolvedValue('AB'),
    };
    const result = await extractSlicingInfo(
      'Patient.identifier',
      profile([
        {
          id: 'Patient.identifier',
          path: 'Patient.identifier',
          slicing: {
            discriminator: [{ type: 'pattern', path: '$this' }],
            rules: 'open',
          },
        },
        {
          id: 'Patient.identifier:test',
          path: 'Patient.identifier',
          sliceName: 'test',
          binding: {
            strength: 'required',
            valueSet: 'https://example.test/ValueSet/test',
          },
        },
      ]),
      null,
      loader,
    );

    expect(result?.slices[0].bindingValueSet)
      .toBe('https://example.test/ValueSet/test');
    expect(result?.slices[0].bindingCodes).toBeUndefined();
  });
});
