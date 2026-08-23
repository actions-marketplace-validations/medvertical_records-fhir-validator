import { describe, expect, it } from 'vitest';
import {
  getPrimitiveSidecar,
  getResolvedPrimitiveSidecarType,
  isResolvedPrimitiveSidecarValue,
  resolveFhirSegmentValue,
} from './fhir-primitive-sidecar';
import { getValueAtPath } from './validation-utils';

describe('FHIR primitive sidecar boundaries', () => {
  it('returns undefined for scalar and array containers', () => {
    expect(getPrimitiveSidecar(null, 'value')).toBeUndefined();
    expect(getPrimitiveSidecar([], 'value')).toBeUndefined();
    expect(resolveFhirSegmentValue(42, 'value')).toBeUndefined();
    expect(getValueAtPath('Patient', 'Patient.id')).toBeUndefined();
  });

  it('does not expose a non-string forged primitive type marker', () => {
    const value = {
      [Symbol.for('records.fhirPrimitiveSidecarValue')]: true,
      [Symbol.for('records.fhirPrimitiveSidecarType')]: 42,
    };

    expect(getResolvedPrimitiveSidecarType(value)).toBeUndefined();
  });

  it('marks a resolved sidecar without mutating the input resource', () => {
    const sidecar = Object.freeze({ extension: [{ url: 'data-absent-reason' }] });
    const resource = Object.freeze({ _valueString: sidecar });

    const resolved = resolveFhirSegmentValue(resource, 'value[x]');

    expect(resolved).not.toBe(sidecar);
    expect(isResolvedPrimitiveSidecarValue(resolved)).toBe(true);
    expect(getResolvedPrimitiveSidecarType(resolved)).toBe('string');
    expect(isResolvedPrimitiveSidecarValue(sidecar)).toBe(false);
    expect(Reflect.ownKeys(sidecar)).toEqual(['extension']);
  });
});
