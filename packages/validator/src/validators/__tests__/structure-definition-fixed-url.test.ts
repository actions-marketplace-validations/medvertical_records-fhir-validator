import { describe, expect, it } from 'vitest';
import { StructureDefinitionValidator } from '../structure-definition-validator';

describe('StructureDefinitionValidator fixed extension URL rules', () => {
  const validator = new StructureDefinitionValidator();

  it('does not infer a fixed URL override from a non-StructureDefinition baseDefinition', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      type: 'Extension',
      url: 'http://uwearme.com',
      baseDefinition: 'http://hl7.org',
      differential: {
        element: [
          {
            id: 'Extension.url',
            path: 'Extension.url',
            fixedUri: 'http://uwearme.com',
          },
        ],
      },
    });

    expect(issues.some(issue => issue.code === 'sd-extension-fixed-url-override')).toBe(false);
  });

  it('still reports fixed URL overrides for derived StructureDefinition extensions', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      type: 'Extension',
      url: 'http://example.org/fhir/StructureDefinition/child-extension',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/parent-extension',
      differential: {
        element: [
          {
            id: 'Extension.url',
            path: 'Extension.url',
            fixedUri: 'http://example.org/fhir/StructureDefinition/child-extension',
          },
        ],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'sd-extension-fixed-url-override',
      path: 'Extension.url',
    }));
  });
});
