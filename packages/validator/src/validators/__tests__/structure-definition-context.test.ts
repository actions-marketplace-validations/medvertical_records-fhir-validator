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

  it('ignores malformed context entries without throwing', () => {
    expect(() => validator.validate({
      resourceType: 'StructureDefinition',
      type: 'Extension',
      url: 'http://example.org/StructureDefinition/malformed-context',
      context: [
        null,
        { type: 'element', expression: 42 },
        'ElementDefinition.nope',
      ],
      differential: { element: {} },
    })).not.toThrow();
  });

  it('handles an Extension context warning when the canonical URL is missing', () => {
    expect(() => validator.validate({
      resourceType: 'StructureDefinition',
      type: 'Extension',
      context: [{ type: 'element', expression: 'Element' }],
    })).not.toThrow();
  });
});
