import { describe, expect, it } from 'vitest';

import type { ElementDefinition } from '../../structure-definition-types';
import { additionalBindingsForElement } from '../terminology-additional-bindings';

const URL = 'http://hl7.org/fhir/tools/StructureDefinition/additional-binding';

function additional(purpose: string, valueSet: string) {
  return {
    url: URL,
    extension: [
      { url: 'purpose', valueCode: purpose },
      { url: 'valueSet', valueCanonical: valueSet },
    ],
  };
}

describe('additional binding execution matrix', () => {
  it('executes membership purposes, preserves versions, and ignores descriptive purposes', () => {
    const versioned = 'http://example.org/ValueSet/required|2026.1';
    const element = {
      path: 'Observation.code',
      binding: {
        strength: 'example',
        valueSet: 'http://example.org/ValueSet/base',
        extension: [
          additional('required', versioned),
          additional('required', versioned),
          additional('extensible', 'http://example.org/ValueSet/extensible'),
          additional('preferred', 'http://example.org/ValueSet/preferred'),
          additional('candidate', 'http://example.org/ValueSet/candidate'),
          additional('starter', 'http://example.org/ValueSet/starter'),
          additional('ui', 'http://example.org/ValueSet/ui'),
        ],
      },
    } as ElementDefinition;

    expect(additionalBindingsForElement(element)).toEqual([
      { strength: 'required', valueSet: versioned },
      { strength: 'extensible', valueSet: 'http://example.org/ValueSet/extensible' },
      { strength: 'preferred', valueSet: 'http://example.org/ValueSet/preferred' },
    ]);
  });
});
