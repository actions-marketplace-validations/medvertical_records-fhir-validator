import { describe, expect, it } from 'vitest';

import { evaluateSpecialisedRootConstraint } from '../sd-fhirpath-specialised-root-constraints';

describe('specialised SD root constraints', () => {
  it('ignores unrelated constraint keys', () => {
    expect(evaluateSpecialisedRootConstraint('other', null)).toBeNull();
  });

  it('handles malformed resources without throwing', () => {
    expect(evaluateSpecialisedRootConstraint('sdf-19', null)).toBe(true);
    expect(evaluateSpecialisedRootConstraint('sdf-19', { url: 42 })).toBe(true);
    expect(evaluateSpecialisedRootConstraint('sdf-19', {
      url: 'http://hl7.org/fhir/StructureDefinition/example',
      differential: { element: [null, { type: [null, { code: 42 }] }] },
      snapshot: 'malformed',
    })).toBe(true);
  });

  it('rejects invalid type codes while skipping malformed siblings', () => {
    expect(evaluateSpecialisedRootConstraint('sdf-19', {
      url: 'http://hl7.org/fhir/StructureDefinition/example',
      differential: {
        element: [
          null,
          { type: [{ code: 'validType' }, { code: 'invalid-type' }] },
        ],
      },
      snapshot: {
        element: [{ type: [{ code: 'BackboneElement.valid' }] }],
      },
    })).toBe(false);
  });

  it('evaluates CodeSystem code uniqueness across nested concepts', () => {
    expect(evaluateSpecialisedRootConstraint('csd-1', {
      resourceType: 'CodeSystem',
      concept: [
        { code: 'parent', concept: [{ code: 'child' }] },
        { code: 'sibling' },
      ],
    })).toBe(true);

    expect(evaluateSpecialisedRootConstraint('csd-1', {
      resourceType: 'CodeSystem',
      concept: [
        { code: 'duplicate' },
        { code: 'parent', concept: [{ code: 'duplicate' }] },
      ],
    })).toBe(false);
  });

  it('checks large flat CodeSystems without generic descendant expansion', () => {
    const concept = Array.from({ length: 50_000 }, (_, index) => ({
      code: `code-${index}`,
    }));

    expect(evaluateSpecialisedRootConstraint('csd-1', {
      resourceType: 'CodeSystem',
      concept,
    })).toBe(true);
  });
});
