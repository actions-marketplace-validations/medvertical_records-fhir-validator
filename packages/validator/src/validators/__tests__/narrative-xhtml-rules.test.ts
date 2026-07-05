import { describe, expect, it } from 'vitest';
import { validateNarrativeDiv } from '../narrative-xhtml-rules';

describe('Narrative XHTML attribute validation', () => {
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
