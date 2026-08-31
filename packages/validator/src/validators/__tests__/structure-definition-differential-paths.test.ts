import { describe, expect, it } from 'vitest';
import { StructureDefinitionValidator } from '../structure-definition-validator';

describe('StructureDefinitionValidator differential path checks', () => {
  const validator = new StructureDefinitionValidator();

  it('does not treat ordinary element names with choice-like prefixes as bad choice paths', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/CodeSystem',
      type: 'CodeSystem',
      differential: {
        element: [
          { id: 'CodeSystem', path: 'CodeSystem' },
          { id: 'CodeSystem.valueSet', path: 'CodeSystem.valueSet' },
        ],
      },
    });

    expect(issues.filter(issue => issue.code === 'sd-snapshot-error-bad-choice')).toHaveLength(0);
  });

  it('still reports concrete Extension.value[x] paths that do not use the polymorphic base path', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/bad-extension',
      type: 'Extension',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
      differential: {
        element: [
          { id: 'Extension', path: 'Extension' },
          { id: 'Extension.valueIdentifier', path: 'Extension.valueIdentifier' },
        ],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-snapshot-error-bad-choice',
    }));
  });

  it('reports invalid concrete Observation.value[x] paths without a snapshot', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://example.com/Observation',
      type: 'Observation',
      differential: {
        element: [{ path: 'Observation.valueBla' }],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-snapshot-error-bad-choice',
      severity: 'error',
    }));
  });

  it('detects root slicing even when a malformed differential does not put the root first', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://example.com/Observation',
      type: 'Observation',
      differential: {
        element: [
          { path: 'Observation.status' },
          { path: 'Observation', slicing: { rules: 'open', discriminator: [] } },
        ],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-root-slicing-invalid',
      path: 'StructureDefinition.differential.element[1]',
    }));
  });

  it('warns when a CodeableConcept pattern declares a system without a code', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://example.com/Encounter',
      type: 'Encounter',
      differential: {
        element: [{
          path: 'Encounter.type',
          patternCodeableConcept: {
            coding: [{ system: 'https://example.com/CodeSystem/test' }],
          },
        }],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-pattern-coding-missing-code',
      severity: 'warning',
    }));
  });

  it('attributes snapshot-only pattern findings to the snapshot path', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://example.com/Encounter',
      type: 'Encounter',
      snapshot: {
        element: [{
          id: 'Encounter.type',
          path: 'Encounter.type',
          patternCodeableConcept: {
            coding: [{ system: 'https://example.com/CodeSystem/test' }],
          },
        }],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-pattern-coding-missing-code',
      path: 'StructureDefinition.snapshot.element[0].patternCodeableConcept.coding[0].code',
    }));
  });

  it('does not duplicate the same pattern finding from differential and snapshot', () => {
    const element = {
      id: 'Encounter.type',
      path: 'Encounter.type',
      patternCodeableConcept: {
        coding: [{ system: 'https://example.com/CodeSystem/test', code: '' }],
      },
    };
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      url: 'http://example.com/Encounter',
      type: 'Encounter',
      differential: { element: [element] },
      snapshot: { element: [element] },
    });

    expect(issues.filter(issue =>
      issue.code === 'sd-pattern-coding-missing-code'
    )).toHaveLength(1);
  });
});
