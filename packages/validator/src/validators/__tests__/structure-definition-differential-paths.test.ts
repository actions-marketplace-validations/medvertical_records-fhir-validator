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
});
