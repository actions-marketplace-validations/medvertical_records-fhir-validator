import { describe, expect, it } from 'vitest';
import { StructureDefinitionValidator } from '../structure-definition-validator';

describe('StructureDefinitionValidator context expressions', () => {
  const validator = new StructureDefinitionValidator();

  it('accepts HL7 core extension contexts on ElementDefinition.type children', () => {
    for (const expression of ['ElementDefinition.type.code', 'ElementDefinition.type.profile']) {
      const issues = validator.validate({
        resourceType: 'StructureDefinition',
        type: 'Extension',
        url: `http://hl7.org/fhir/StructureDefinition/test-${expression.split('.').pop()}`,
        context: [{ type: 'element', expression }],
      });

      expect(issues.filter(issue => issue.code === 'sd-context-invalid-element')).toHaveLength(0);
    }
  });

  it('still rejects unknown ElementDefinition context paths', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      type: 'Extension',
      url: 'http://example.org/StructureDefinition/bad-context',
      context: [{ type: 'element', expression: 'ElementDefinition.type.nope' }],
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-context-invalid-element',
      path: 'StructureDefinition.context[0]',
    }));
  });
});
