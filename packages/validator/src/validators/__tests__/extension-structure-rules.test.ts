import { describe, expect, it } from 'vitest';
import { validateExtensionStructure } from '../extension-structure-rules';

describe('validateExtensionStructure', () => {
  it('counts primitive sidecar-only value[x] extensions as a value', () => {
    const issues = validateExtensionStructure(
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
      'Extension',
      'CodeSystem.concept[0].extension[0]',
      'CodeSystem',
    );

    expect(issues.filter(issue => issue.code === 'profile-extension-no-value')).toHaveLength(0);
  });

  it('still reports extensions with neither value[x] nor nested extensions', () => {
    const issues = validateExtensionStructure(
      { url: 'http://example.org/StructureDefinition/empty' },
      'Extension',
      'Patient.extension[0]',
      'Patient',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-extension-no-value',
    }));
  });
});
