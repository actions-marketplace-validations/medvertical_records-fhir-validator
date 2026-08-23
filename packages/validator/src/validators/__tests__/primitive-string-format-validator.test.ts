import { describe, expect, it } from 'vitest';
import { validatePrimitiveStringFormat } from '../primitive-string-format-validator';

describe('validatePrimitiveStringFormat string whitespace lint', () => {
  it('warns when a string value has leading or trailing whitespace', () => {
    const issue = validatePrimitiveStringFormat(' padded ', 'string', 'Patient.name[0].family');

    expect(issue).toMatchObject({
      code: 'string-whitespace-padding',
      severity: 'warning',
      path: 'Patient.name[0].family',
      details: expect.objectContaining({ suggestedValue: 'padded' }),
    });
  });

  it('accepts a clean string value', () => {
    expect(validatePrimitiveStringFormat('clean', 'string', 'Patient.name[0].family')).toBeNull();
  });

  it('accepts internal whitespace', () => {
    expect(validatePrimitiveStringFormat('two words', 'string', 'Patient.name[0].text')).toBeNull();
  });

  it('leaves whitespace-only strings to the whitespace-only primitive rule', () => {
    expect(validatePrimitiveStringFormat('   ', 'string', 'Patient.name[0].family')).toBeNull();
  });

  it('treats exotic Unicode whitespace incl. U+0085 NEL as whitespace-only, not padding', () => {
    expect(validatePrimitiveStringFormat('\t\n\u000b\u000c\r \u0085\u00a0\u2000\u3000', 'string', 'Parameters.parameter[0].value[x]')).toBeNull();
  });

  it('does not lint markdown or code values', () => {
    expect(validatePrimitiveStringFormat('trailing space ', 'markdown', 'Composition.section[0].text')).toBeNull();
    expect(validatePrimitiveStringFormat(' active', 'code', 'Patient.gender')).toBeNull();
  });
});
