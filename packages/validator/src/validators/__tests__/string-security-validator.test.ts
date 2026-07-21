import { describe, expect, it } from 'vitest';
import { StringSecurityValidator } from '../string-security-validator';

describe('StringSecurityValidator', () => {
  it('flags real HTML tags in non-narrative strings', () => {
    const validator = new StringSecurityValidator();

    const issues = validator.validate({
      resourceType: 'Procedure',
      code: {
        text: 'unsafe <script>alert(1)</script>',
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'string-security-html',
      path: 'Procedure.code.text',
    }));
  });

  it('does not flag angle-bracket template placeholders as HTML', () => {
    const validator = new StringSecurityValidator();

    const issues = validator.validate({
      resourceType: 'Procedure',
      category: {
        coding: [{
          system: 'MediConnect',
          code: 'PR16<AdmissionYear>',
          display: 'PR16<AdmissionYear>',
        }],
      },
    });

    expect(issues).toHaveLength(0);
  });

  it('does not flag formal StructureDefinition documentation that mentions XHTML tags', () => {
    const validator = new StringSecurityValidator();

    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      snapshot: {
        element: [{
          id: 'Narrative.div',
          path: 'Narrative.div',
          comment: 'The XHTML content may include <a> elements, images, and internally contained styles.',
          constraint: [{
            key: 'txt-1',
            human: 'The narrative SHALL contain basic formatting elements and <a> elements.',
            expression: 'htmlChecks()',
            xpath: 'not(descendant-or-self::h:script)',
          }],
          mapping: [{
            identity: 'rim',
            map: '<rendered-html-fragment>',
          }],
        }],
      },
    });

    expect(issues).toHaveLength(0);
  });

  it('still flags HTML-looking content in regular StructureDefinition strings', () => {
    const validator = new StringSecurityValidator();

    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      title: 'unsafe <script>alert(1)</script>',
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'string-security-html',
      path: 'StructureDefinition.title',
    }));
  });

  it('allows XHTML in the rendering-xhtml extension value', () => {
    const validator = new StringSecurityValidator();
    const issues = validator.validate({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'display',
        type: 'display',
        _text: {
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml',
            valueString: '<p>Rendered prompt</p>',
          }],
        },
      }],
    });

    expect(issues).toHaveLength(0);
  });
});
