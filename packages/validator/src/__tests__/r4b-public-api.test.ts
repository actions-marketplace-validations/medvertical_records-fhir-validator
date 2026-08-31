import { describe, it, expect } from 'vitest';
import {
  recordsValidator,
  resolveFhirReleaseContext,
  toInternalFhirVersion,
  type PublicFhirVersion,
  type RecordsValidatorSingleton,
} from '../index';

describe('R4B public release context', () => {
  it('preserves the R4B package identity and exposes the R4 maintenance adapter', () => {
    expect(toInternalFhirVersion('R4B')).toBe('R4');
    expect(resolveFhirReleaseContext('R4B')).toEqual({
      publicVersion: 'R4B',
      engineVersion: 'R4',
      corePackage: 'hl7.fhir.r4b.core#4.3.0',
      fhirPathModel: 'r4',
      compatibilityMode: 'r4b-maintenance-adapter',
    });
  });

  it('passes R4 / R5 / R6 through unchanged', () => {
    const cases: Array<[PublicFhirVersion, 'R4' | 'R5' | 'R6']> = [
      ['R4', 'R4'],
      ['R5', 'R5'],
      ['R6', 'R6'],
    ];
    for (const [input, expected] of cases) {
      expect(toInternalFhirVersion(input)).toBe(expected);
    }
    expect(resolveFhirReleaseContext('R4').corePackage)
      .toBe('hl7.fhir.r4.core#4.0.1');
    expect(resolveFhirReleaseContext('R5').corePackage)
      .toBe('hl7.fhir.r5.core#5.0.0');
    expect(resolveFhirReleaseContext('R6').corePackage)
      .toBe('hl7.fhir.r6.core#6.0.0-ballot4');
  });

  it('compiles when callers pin the input type to PublicFhirVersion', () => {
    // Pure type-level smoke: the call site below must type-check with
    // 'R4B' as a literal because PublicFhirVersion includes it.
    const v: PublicFhirVersion = 'R4B';
    expect(toInternalFhirVersion(v)).toBe('R4');
  });

  it('exports a typed singleton facade without eager initialization', () => {
    const singleton: RecordsValidatorSingleton = recordsValidator;
    const validateRequest: RecordsValidatorSingleton['validateRequest'] = singleton.validateRequest.bind(singleton);
    const validate: RecordsValidatorSingleton['validate'] = singleton.validate.bind(singleton);
    const validateAll: RecordsValidatorSingleton['validateAll'] = singleton.validateAll.bind(singleton);

    expect(singleton.isCreated()).toBe(false);
    expect(typeof validateRequest).toBe('function');
    expect(typeof validate).toBe('function');
    expect(typeof validateAll).toBe('function');
  });
});
