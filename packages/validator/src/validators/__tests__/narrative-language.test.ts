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

  it('reports xml:lang mismatches even when lang matches the resource', () => {
    const issues = new NarrativeValidator().validateNarrative({
      resourceType: 'Patient',
      language: 'en-AU',
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml" lang="en-AU" xml:lang="de">text</div>',
      },
    }, 'Patient');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'narrative-lang-mismatch',
      severity: 'warning',
      path: 'Patient',
    }));
  });

  it('compares BCP-47 language tags case-insensitively', () => {
    const issues = new NarrativeValidator().validateNarrative({
      resourceType: 'Patient',
      language: 'en-US',
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml" lang="EN-us" xml:lang="en-us">text</div>',
      },
    }, 'Patient');

    expect(issues.find(issue => issue.code === 'narrative-lang-mismatch')).toBeUndefined();
  });
});
