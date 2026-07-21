import { describe, expect, it } from 'vitest';
import { NarrativeValidator } from '../narrative-validator';

describe('NarrativeValidator language attributes', () => {
  it('does not treat xml:lang as the separate HTML lang attribute', () => {
    const issues = new NarrativeValidator().validateNarrative({
      resourceType: 'Patient',
      language: 'en-AU',
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml" xml:lang="en-AU">text</div>',
      },
    }, 'Patient');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-missing-htmllang',
      severity: 'warning',
      path: 'Patient',
    }));
  });
});
