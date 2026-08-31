import { describe, expect, it } from 'vitest';
import { UcumCodeValidator } from '../ucum-validator';

const ucumValidator = new UcumCodeValidator();
import {
  buildInvalidUcumIssueDetails,
  buildInvalidUcumMessage,
} from '../../core/executors/terminology-ucum-rules';

describe('ucum-lhc suggestion engine (gap P-5)', () => {
  it('valid codes carry no suggestion', () => {
    expect(ucumValidator.validate('mg/dL')).toEqual({ valid: true });
  });

  it('suggests a correction for a code absent from the static table', () => {
    // `mmHg` is NOT in COMMON_UCUM_CORRECTIONS — only the ucum-lhc engine
    // can propose `mm[Hg]` here.
    const result = ucumValidator.validate('mmHg');
    expect(result.valid).toBe(false);
    expect(result.suggestion?.code).toBe('mm[Hg]');
  });

  it('threads the parser suggestion into issue details and message', () => {
    const result = ucumValidator.validate('mmHg');
    const path = 'Observation.valueQuantity.code';

    expect(buildInvalidUcumIssueDetails('mmHg', path, result.message, result.suggestion))
      .toEqual(expect.objectContaining({
        suggestedCode: 'mm[Hg]',
        fixHint: expect.stringContaining("'mm[Hg]'"),
      }));

    expect(buildInvalidUcumMessage('mmHg', path, result.message, result.suggestion))
      .toContain("Use 'mm[Hg]' in Quantity.code.");
  });

  it('still flags an unfixable invalid code without a suggestion', () => {
    const result = ucumValidator.validate('foobar');
    expect(result.valid).toBe(false);
    expect(result.suggestion).toBeUndefined();
  });
});

describe('annotations with spaces', () => {
  // The HL7 reference validator accepts spaces inside `{...}` and official
  // IG examples rely on it (hl7.fhir.eu.hdr `{keer per dag inhaleren}`);
  // ucum-lhc alone would reject them per the strict UCUM grammar.
  it('accepts a standalone annotation containing spaces', () => {
    expect(ucumValidator.validate('{keer per dag inhaleren}')).toEqual({ valid: true });
  });

  it('accepts a unit with a spaced annotation suffix', () => {
    expect(ucumValidator.validate('mL/{per dag}')).toEqual({ valid: true });
  });

  it('still rejects non-ASCII characters inside annotations', () => {
    expect(ucumValidator.validate('{häufigkeit}').valid).toBe(false);
  });
});
