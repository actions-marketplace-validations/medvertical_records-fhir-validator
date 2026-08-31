import { describe, expect, it } from 'vitest';

import type { ElementDefinition } from '../../core/structure-definition-types';
import { targetMatchesSliceDefinition } from '../constraint-slice-targets';

describe('constraint slice target matching', () => {
  it('treats fixed complex values as exact rather than partial patterns', () => {
    const slice: ElementDefinition = {
      id: 'Patient.identifier:fixed',
      path: 'Patient.identifier',
      sliceName: 'fixed',
      fixedIdentifier: {
        system: 'http://example.org/system',
      },
    };

    expect(targetMatchesSliceDefinition(
      {
        system: 'http://example.org/system',
        value: 'extra',
      },
      slice,
      [slice],
    )).toBe(false);
  });

  it('keeps pattern complex values partial', () => {
    const slice: ElementDefinition = {
      id: 'Patient.identifier:pattern',
      path: 'Patient.identifier',
      sliceName: 'pattern',
      patternIdentifier: {
        system: 'http://example.org/system',
      },
    };

    expect(targetMatchesSliceDefinition(
      {
        system: 'http://example.org/system',
        value: 'allowed-extra',
      },
      slice,
      [slice],
    )).toBe(true);
  });

  it('uses child constraints and ignores malformed sibling definitions', () => {
    const slice: ElementDefinition = {
      id: 'Patient.identifier:insurance',
      path: 'Patient.identifier',
      sliceName: 'insurance',
    };
    const child: ElementDefinition = {
      id: 'Patient.identifier:insurance.type',
      path: 'Patient.identifier.type',
      patternCodeableConcept: {
        coding: [{ system: 'http://example.org/type', code: 'insurance' }],
      },
    };
    const elements = [
      null,
      { id: 42 },
      slice,
      child,
    ] as unknown as ElementDefinition[];

    expect(targetMatchesSliceDefinition(
      {
        type: {
          coding: [
            { system: 'http://example.org/type', code: 'other' },
            { system: 'http://example.org/type', code: 'insurance' },
          ],
        },
      },
      slice,
      elements,
    )).toBe(true);
  });

  it('matches versioned actual canonicals against an unversioned fixed canonical', () => {
    const slice: ElementDefinition = {
      id: 'Patient.meta.profile:expected',
      path: 'Patient.meta.profile',
      sliceName: 'expected',
      fixedCanonical: 'http://example.org/StructureDefinition/patient',
    };

    expect(targetMatchesSliceDefinition(
      'http://example.org/StructureDefinition/patient|1.0.0',
      slice,
      [slice],
    )).toBe(true);
  });
});
