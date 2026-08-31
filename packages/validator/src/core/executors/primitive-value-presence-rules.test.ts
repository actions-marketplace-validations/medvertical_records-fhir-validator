import { describe, expect, it } from 'vitest';
import { resolveFhirSegmentValue } from '../fhir-primitive-sidecar';
import { getValidationTargets } from '../../business-rules';
import type { ElementDefinition } from '../structure-definition-types';
import { validatePrimitiveValuePresence } from './primitive-value-presence-rules';

const MUST_HAVE_VALUE =
  'http://hl7.org/fhir/5.0/StructureDefinition/extension-ElementDefinition.mustHaveValue';
const VALUE_ALTERNATIVES =
  'http://hl7.org/fhir/5.0/StructureDefinition/extension-ElementDefinition.valueAlternatives';
const ABSENT_REASON = 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';

describe('primitive value presence rules', () => {
  it('enforces native and backported mustHaveValue on sidecar-only primitives', () => {
    const sidecar = resolvedSidecar(ABSENT_REASON);
    const native = element({ mustHaveValue: true });
    const backported = element({
      extension: [{ url: MUST_HAVE_VALUE, valueBoolean: true }],
    });

    for (const definition of [native, backported]) {
      expect(validatePrimitiveValuePresence(sidecar, definition, 'Patient.active', 'profile'))
        .toContainEqual(expect.objectContaining({
          code: 'profile-primitive-value-required',
          path: 'Patient.active',
        }));
    }
    expect(validatePrimitiveValuePresence(true, native, 'Patient.active', 'profile')).toEqual([]);
  });

  it('accepts only configured native and backported value alternatives', () => {
    const native = element({ valueAlternatives: [ABSENT_REASON] });
    const backported = element({
      extension: [{ url: VALUE_ALTERNATIVES, valueCanonical: ABSENT_REASON }],
    });

    for (const definition of [native, backported]) {
      expect(validatePrimitiveValuePresence(
        resolvedSidecar(ABSENT_REASON), definition, 'Patient.active', 'profile',
      )).toEqual([]);
      expect(validatePrimitiveValuePresence(
        resolvedSidecar('http://hl7.org/fhir/StructureDefinition/iso21090-nullFlavor'),
        definition,
        'Patient.active',
        'profile',
      )).toContainEqual(expect.objectContaining({
        code: 'profile-primitive-value-alternative-required',
        path: 'Patient.active',
      }));
    }
  });

  it('accepts configured value alternatives when mustHaveValue is also set', () => {
    const native = element({
      mustHaveValue: true,
      valueAlternatives: [ABSENT_REASON],
    });
    const backported = element({
      extension: [
        { url: MUST_HAVE_VALUE, valueBoolean: true },
        { url: VALUE_ALTERNATIVES, valueCanonical: ABSENT_REASON },
      ],
    });

    for (const definition of [native, backported]) {
      expect(validatePrimitiveValuePresence(
        resolvedSidecar(ABSENT_REASON), definition, 'Patient.active', 'profile',
      )).toEqual([]);
      expect(validatePrimitiveValuePresence(
        resolvedSidecar('http://hl7.org/fhir/StructureDefinition/iso21090-nullFlavor'),
        definition,
        'Patient.active',
        'profile',
      )).toContainEqual(expect.objectContaining({
        code: 'profile-primitive-value-required',
      }));
    }
  });

  it('enforces mustHaveValue for a sidecar-only repeating primitive entry', () => {
    const resource = {
      resourceType: 'Patient',
      name: [{
        given: [null],
        _given: [{ extension: [{ url: ABSENT_REASON, valueCode: 'unknown' }] }],
      }],
    };
    const [target] = getValidationTargets(resource, 'Patient.name.given');

    expect(validatePrimitiveValuePresence(
      target.value,
      { path: 'Patient.name.given', type: [{ code: 'string' }], mustHaveValue: true },
      target.fullPath,
      'profile',
    )).toContainEqual(expect.objectContaining({
      code: 'profile-primitive-value-required',
      path: 'Patient.name[0].given[0]',
    }));
  });
});

function element(properties: Partial<ElementDefinition>): ElementDefinition {
  return { path: 'Patient.active', type: [{ code: 'boolean' }], ...properties };
}

function resolvedSidecar(url: string): unknown {
  return resolveFhirSegmentValue({
    _active: { extension: [{ url, valueCode: 'unknown' }] },
  }, 'active');
}
