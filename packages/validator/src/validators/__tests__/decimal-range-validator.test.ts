import { describe, expect, it } from 'vitest';
import { validateDecimalRange } from '../decimal-range-validator';

const PATH = 'Observation.valueQuantity.value';

describe('validateDecimalRange (HL7 Utilities.checkDecimal parity)', () => {
  it('warns on a value whose plain rendering needs more than 18 digits (obs-decimal parity)', () => {
    // 1000000000000000000 renders as 19 positional digits; the Java
    // validator warns on the same lexeme in fhir-test-cases obs-decimal.
    const issue = validateDecimalRange(1e18, PATH);

    expect(issue).toMatchObject({
      code: 'decimal-value-out-of-range',
      severity: 'warning',
      path: PATH,
    });
  });

  it('warns on huge magnitudes that JS renders in e-notation', () => {
    expect(validateDecimalRange(1e300, PATH)).toMatchObject({
      code: 'decimal-value-out-of-range',
      severity: 'warning',
    });
  });

  it('warns symmetrically on huge negative values', () => {
    expect(validateDecimalRange(-1e245, PATH)).toMatchObject({
      code: 'decimal-value-out-of-range',
    });
  });

  it('warns on exponent overflow that parses to Infinity (1E+30000)', () => {
    expect(validateDecimalRange(Number.POSITIVE_INFINITY, PATH)).toMatchObject({
      code: 'decimal-value-out-of-range',
    });
  });

  it('warns on long fractional positions like Java does on the plain lexeme', () => {
    // 0.0000012345678901234567 -> 22 digits after the point.
    expect(validateDecimalRange(0.0000012345678901234567, PATH)).toMatchObject({
      code: 'decimal-value-out-of-range',
    });
  });

  it('accepts common clinical magnitudes', () => {
    expect(validateDecimalRange(1.0, PATH)).toBeNull();
    expect(validateDecimalRange(-37.5, PATH)).toBeNull();
    expect(validateDecimalRange(0, PATH)).toBeNull();
    expect(validateDecimalRange(123456789012345.67, PATH)).toBeNull();
    // 17 nines round to 1e17, which still renders with 18 digits.
    expect(validateDecimalRange(Number('99999999999999999'), PATH)).toBeNull();
  });

  it('flags the double-rounding boundary at 1e18 (documented lexeme-loss edge)', () => {
    // 18 nines are a Java-acceptable 18-digit lexeme, but the nearest double
    // is exactly 1e18, which renders with 19 digits. The original digits are
    // unrecoverable after JSON.parse.
    expect(validateDecimalRange(Number('999999999999999999'), PATH)).not.toBeNull();
  });

  it('accepts small e-notation magnitudes Java accepts (obs-decimal 1E-22)', () => {
    expect(validateDecimalRange(1e-22, PATH)).toBeNull();
    expect(validateDecimalRange(1e-300, PATH)).toBeNull();
  });

  it('accepts a 4-digit-exponent boundary value the way Java accepts 1E+3000', () => {
    // 1E+3000 overflows a double, so the closest reachable behaviour is the
    // largest finite double; it renders as e-notation and is therefore
    // range-warned. The Java-accepted lexeme itself is unreachable after
    // JSON.parse, which is the documented deviation.
    expect(validateDecimalRange(Number.MAX_VALUE, PATH)).not.toBeNull();
  });
});
