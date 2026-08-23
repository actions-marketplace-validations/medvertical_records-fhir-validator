import { describe, expect, it } from 'vitest';

import { NarrativeValidator } from '../narrative-validator';

describe('NarrativeValidator input safety', () => {
  const validator = new NarrativeValidator();

  it('ignores resources without a Narrative object', () => {
    expect(validator.validateNarrative(null, 'Patient')).toEqual([]);
    expect(validator.validateNarrative(42, 'Patient')).toEqual([]);
    expect(validator.validateNarrative({ text: 'not-an-object' }, 'Patient')).toEqual([]);
  });

  it('delegates a malformed div value to primitive type validation', () => {
    const issues = validator.validateNarrative({
      resourceType: 'Patient',
      text: {
        status: 'generated',
        div: { nested: true },
      },
    }, 'Patient');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'structural-primitive-type-mismatch',
      path: 'Patient.text.div',
    }));
  });

  it('contains cyclic Composition section graphs', () => {
    const section: Record<string, unknown> = {
      text: {
        div: '<div xmlns="http://www.w3.org/1999/xhtml">ok</div>',
      },
    };
    section.section = [section];

    expect(() => validator.validateNarrative({
      resourceType: 'Composition',
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml">ok</div>',
      },
      section: [section],
    }, 'Composition')).not.toThrow();
  });

  it('reports malformed nested section divs at their concrete path', () => {
    const issues = validator.validateNarrative({
      resourceType: 'Composition',
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml">ok</div>',
      },
      section: [{
        text: {
          div: ['not-xhtml'],
          extension: [null, 42, {}],
        },
      }],
    }, 'Composition');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'structural-primitive-type-mismatch',
      path: 'Composition.section[0].text.div',
    }));
  });
});
