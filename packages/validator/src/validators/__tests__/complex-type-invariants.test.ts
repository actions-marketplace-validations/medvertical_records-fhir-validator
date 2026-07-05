import { describe, expect, it } from 'vitest';
import { checkExtensionExt1 } from '../complex-type-invariants';

describe('complex type invariants', () => {
  it('counts primitive sidecar-only extension values for ext-1', () => {
    const issue = checkExtensionExt1(
      {
        url: 'http://hl7.org/fhir/StructureDefinition/codesystem-concept-comments',
        _valueString: {
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/translation',
            extension: [
              { url: 'lang', valueString: 'nl' },
              { url: 'content', valueString: 'Niet aanwezig' },
            ],
          }],
        },
      },
      'CodeSystem.concept[0].extension[0]',
    );

    expect(issue).toBeNull();
  });

  it('still reports extensions with neither nested extensions nor value[x]', () => {
    const issue = checkExtensionExt1(
      {
        url: 'http://example.org/fhir/StructureDefinition/empty-extension',
      },
      'Patient.extension[0]',
    );

    expect(issue).toEqual(expect.objectContaining({
      code: 'profile-constraint-violation',
      ruleId: undefined,
      path: 'Patient.extension[0]',
    }));
    expect(issue?.details).toEqual(expect.objectContaining({
      constraintKey: 'ext-1',
      hasNestedExtension: false,
      hasValueX: false,
    }));
  });
});
