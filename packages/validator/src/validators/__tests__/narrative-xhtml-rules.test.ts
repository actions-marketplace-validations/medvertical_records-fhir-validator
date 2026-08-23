import { describe, expect, it } from 'vitest';
import { evaluateHtmlChecksConstraint } from '../fhirpath-html-checks';
import { validateNarrativeDiv } from '../narrative-xhtml-rules';

describe('Narrative XHTML attribute validation', () => {
  it('reports a non-string div as a primitive type mismatch without throwing', () => {
    const issues = validateNarrativeDiv(
      { invalidType: true },
      'Composition.text',
      'Composition',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'structural-primitive-type-mismatch',
      path: 'Composition.text.div',
    }));
  });

  it('allows HTML 4 strike-through formatting elements used by FHIR narratives', () => {
    const div =
      '<div xmlns="http://www.w3.org/1999/xhtml">' +
      '<p><s>retired label</s> <strike>old label</strike></p>' +
      '</div>';

    const issues = validateNarrativeDiv(div, 'DeviceDefinition.text', 'DeviceDefinition');

    expect(issues.filter(issue => issue.code === 'narrative-invalid-element')).toHaveLength(0);
    expect(issues.filter(issue => issue.code === 'narrative-txt1-violation')).toHaveLength(0);
  });

  it('does not treat base64 data URI fragments inside style values as attributes', () => {
    const div =
      '<div xmlns="http://www.w3.org/1999/xhtml">' +
      '<table><tr><td style="background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAACCAYAAACg/LjIAAAAL0lEQVR42u3XsQ0AQAgCQHdl/xn8jxvYWB3JlTR0VJLa+OltBwAAYP6EEQAAgCsPVYVAgIJrA/sAAAAASUVORK5CYII=)" class="hierarchy">x</td></tr></table>' +
      '</div>';

    const issues = validateNarrativeDiv(div, 'StructureDefinition.text', 'StructureDefinition');

    expect(issues.filter(issue => issue.code === 'narrative-invalid-attribute')).toHaveLength(0);
    expect(issues.filter(issue => issue.code === 'narrative-txt1-violation')).toHaveLength(0);
  });

  it('still reports real disallowed attributes', () => {
    const div =
      '<div xmlns="http://www.w3.org/1999/xhtml">' +
      '<table><tr><td saaaaasuvork5cyii="x">x</td></tr></table>' +
      '</div>';

    const issues = validateNarrativeDiv(div, 'StructureDefinition.text', 'StructureDefinition');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-invalid-attribute',
      details: expect.objectContaining({
        element: 'td',
        attribute: 'saaaaasuvork5cyii',
      }),
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-txt1-violation',
    }));
  });
});

describe('htmlChecks() on non-narrative xhtml fragments', () => {
  it('accepts a bare element fragment without demanding a narrative root div', () => {
    const issues = evaluateHtmlChecksConstraint(
      'htmlChecks()',
      "<img src='data:image/png;base64,AAAA'/>",
      'Questionnaire.item.answerOption.value[x].display.extension[0].valueString',
      'Questionnaire',
    );

    expect(issues).toEqual([]);
  });

  it('still applies the full narrative contract to Narrative.div contexts', () => {
    const issues = evaluateHtmlChecksConstraint(
      'htmlChecks()',
      '<p>no root div</p>',
      'Questionnaire.text.div',
      'Questionnaire',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-invalid-root',
    }));
  });

  it('keeps the content policy for fragments', () => {
    const issues = evaluateHtmlChecksConstraint(
      'htmlChecks()',
      '<script>alert(1)</script>',
      'Questionnaire.item.text.extension[0].valueString',
      'Questionnaire',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-forbidden-content',
      path: 'Questionnaire.item.text.extension[0].valueString',
    }));
  });
});
