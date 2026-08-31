import { describe, expect, it } from 'vitest';
import { validateDateYearPlausibility } from '../primitive-string-format-validator';
import { TypeValidator } from '../type-validator';

const MAX_PLAUSIBLE_YEAR = new Date().getUTCFullYear() + 80;

describe('validateDateYearPlausibility', () => {
  it('warns for a dateTime far in the future (year 2140, seen in lforms R5 data)', () => {
    const issue = validateDateYearPlausibility(
      '2140-03-26T13:57:27.779Z',
      'dateTime',
      'Observation.effectiveDateTime',
    );

    expect(issue).toEqual(expect.objectContaining({
      code: 'date-year-implausible',
      severity: 'warning',
      message:
        'The year 2140 is outside the range of reasonable years '
        + `(1800-${new Date().getUTCFullYear() + 80}) - check for data entry error`,
    }));
    // The finding must not carry the date itself: message and details are
    // persisted, and a full date (a birthDate above all) is identifying.
    expect(issue?.message).not.toContain('2140-03-26');
    expect(JSON.stringify(issue?.details ?? {})).not.toContain('2140-03-26');
  });

  it('accepts a contemporary date (2020-01-01)', () => {
    expect(validateDateYearPlausibility('2020-01-01', 'date', 'Patient.birthDate')).toBeNull();
  });

  it('accepts 1800, the inclusive minimum plausible year (boundary)', () => {
    expect(validateDateYearPlausibility('1800-01-01', 'date', 'Patient.birthDate')).toBeNull();
  });

  it('warns for 1799, one year below the 1800 minimum (boundary)', () => {
    expect(validateDateYearPlausibility('1799-12-31', 'date', 'Patient.birthDate'))
      .toEqual(expect.objectContaining({ code: 'date-year-implausible', severity: 'warning' }));
  });

  it('accepts currentYear+80, the inclusive maximum plausible year (boundary)', () => {
    expect(validateDateYearPlausibility(String(MAX_PLAUSIBLE_YEAR), 'dateTime', 'Observation.effectiveDateTime'))
      .toBeNull();
  });

  it('warns for currentYear+81, one year above the maximum (boundary)', () => {
    expect(validateDateYearPlausibility(String(MAX_PLAUSIBLE_YEAR + 1), 'instant', 'Observation.issued'))
      .toEqual(expect.objectContaining({ code: 'date-year-implausible', severity: 'warning' }));
  });

  it('ignores non-date primitive types', () => {
    expect(validateDateYearPlausibility('2140', 'string', 'Patient.name[0].text')).toBeNull();
  });
});

describe('TypeValidator date year plausibility integration', () => {
  it('emits only the plausibility warning for a well-formed but implausible dateTime', async () => {
    const validator = new TypeValidator();

    const issues = await validator.validate(
      '2140-03-26T13:57:27.779Z',
      [{ code: 'dateTime' }],
      'Observation.effectiveDateTime',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(expect.objectContaining({
      code: 'date-year-implausible',
      severity: 'warning',
      path: 'Observation.effectiveDateTime',
    }));
  });

  it('emits no issues for a plausible dateTime', async () => {
    const validator = new TypeValidator();

    const issues = await validator.validate(
      '2020-01-01T12:00:00Z',
      [{ code: 'dateTime' }],
      'Observation.effectiveDateTime',
    );

    expect(issues).toHaveLength(0);
  });

  it('emits an implausible-year warning for instants too', async () => {
    const validator = new TypeValidator();

    const issues = await validator.validate(
      '2140-03-26T13:57:27.779Z',
      [{ code: 'instant' }],
      'Observation.issued',
    );

    expect(issues.map(issue => issue.code)).toEqual(['date-year-implausible']);
  });

  it('keeps format errors exclusive: a malformed implausible date gets no plausibility warning', async () => {
    const validator = new TypeValidator();

    const issues = await validator.validate(
      '2140-02-31',
      [{ code: 'date' }],
      'Patient.birthDate',
    );

    expect(issues.map(issue => issue.code)).toEqual(['structural-invalid-format']);
  });
});
