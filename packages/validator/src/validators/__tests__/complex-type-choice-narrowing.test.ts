import { describe, expect, it, vi } from 'vitest';
import { ComplexTypeValidator } from '../complex-type-validator';
import { TypeValidator } from '../type-validator';
import { narrowChoiceTypeForConcreteSegment } from '../complex-type-path-rules';

/**
 * A concrete choice property (`valueQuantity`) already names its datatype.
 * Before narrowing, the deep walk key-matched the value against every
 * value[x] candidate; genomics-reporting Parameters with `{value: 2}` were
 * walked with the uuid primitive's `value` element (System.String + regex),
 * producing structural-primitive-type-mismatch on a valid decimal.
 */

const quantitySd = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/Quantity',
  name: 'Quantity',
  status: 'active',
  kind: 'complex-type',
  abstract: false,
  type: 'Quantity',
  snapshot: {
    element: [
      { path: 'Quantity' },
      { path: 'Quantity.value', min: 0, max: '1', type: [{ code: 'decimal' }] },
      { path: 'Quantity.unit', min: 0, max: '1', type: [{ code: 'string' }] },
      { path: 'Quantity.system', min: 0, max: '1', type: [{ code: 'uri' }] },
      { path: 'Quantity.code', min: 0, max: '1', type: [{ code: 'code' }] },
    ],
  },
};

const uuidSd = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/uuid',
  name: 'uuid',
  status: 'active',
  kind: 'primitive-type',
  abstract: false,
  type: 'uuid',
  snapshot: {
    element: [
      { path: 'uuid' },
      {
        path: 'uuid.value',
        min: 0,
        max: '1',
        type: [{
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
            valueUrl: 'string',
          }],
          code: 'http://hl7.org/fhirpath/System.String',
        }],
      },
    ],
  },
};

function createValidator(): ComplexTypeValidator {
  const sdLoader = {
    loadProfile: vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/Quantity')) return quantitySd;
      if (url.endsWith('/uuid')) return uuidSd;
      return null;
    }),
  } as never;
  return new ComplexTypeValidator(sdLoader, new TypeValidator());
}

const parametersValueElementDef = {
  id: 'Parameters.parameter.value[x]',
  path: 'Parameters.parameter.value[x]',
  type: [{ code: 'uuid' }, { code: 'Quantity' }],
};

describe('choice-type narrowing for concrete value[x] properties', () => {
  it('accepts an integer-valued Quantity.value under a concrete valueQuantity path', async () => {
    const issues = await createValidator().validateComplexTypeSubElements(
      { value: 2 },
      parametersValueElementDef,
      'Parameters.parameter[0].part[1].valueQuantity',
      '',
      undefined,
      'R4',
    );

    expect(issues).toEqual([]);
  });

  it('narrows a multi-type choice to the type named by the concrete segment', () => {
    const narrowed = narrowChoiceTypeForConcreteSegment(
      parametersValueElementDef,
      'value[x]',
      'valueQuantity',
    );

    expect(narrowed.type).toEqual([{ code: 'Quantity' }]);
  });

  it('keeps the full type list when the concrete segment matches no candidate', () => {
    const narrowed = narrowChoiceTypeForConcreteSegment(
      parametersValueElementDef,
      'value[x]',
      'valueCodeableConcept',
    );

    expect(narrowed.type).toEqual(parametersValueElementDef.type);
  });
});
