import { describe, expect, it, vi } from 'vitest';
import { ComplexTypeValidator } from '../complex-type-validator';
import { TypeValidator } from '../type-validator';

/**
 * Repeating inline components (0..* Element/BackboneElement inside a complex
 * datatype, e.g. Dosage.doseAndRate) blocked the descendant walk: the flat
 * path resolver bailed at the array, so primitives underneath were never
 * type-validated in any FHIR version. These tests pin the R5 Dosage shape
 * that exposed the gap (mutation testing, decimal_extreme class).
 */

const dosageSd = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/Dosage',
  name: 'Dosage',
  status: 'active',
  kind: 'complex-type',
  abstract: false,
  type: 'Dosage',
  snapshot: {
    element: [
      { path: 'Dosage' },
      { path: 'Dosage.text', min: 0, max: '1', type: [{ code: 'string' }] },
      { path: 'Dosage.doseAndRate', min: 0, max: '*', type: [{ code: 'Element' }] },
      { path: 'Dosage.doseAndRate.type', min: 0, max: '1', type: [{ code: 'CodeableConcept' }] },
      { path: 'Dosage.doseAndRate.dose[x]', min: 0, max: '1', type: [{ code: 'Range' }, { code: 'Quantity' }] },
      { path: 'Dosage.doseAndRate.rate[x]', min: 0, max: '1', type: [{ code: 'Ratio' }, { code: 'Range' }, { code: 'Quantity' }] },
    ],
  },
};

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

function createValidator(): ComplexTypeValidator {
  const sdLoader = {
    loadProfile: vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/Dosage')) return dosageSd;
      if (url.endsWith('/Quantity')) return quantitySd;
      return null;
    }),
  } as never;
  return new ComplexTypeValidator(sdLoader, new TypeValidator());
}

const dosageElementDef = {
  id: 'MedicationRequest.dosageInstruction',
  path: 'MedicationRequest.dosageInstruction',
  type: [{ code: 'Dosage' }],
};

function buildDosage(doseQuantity: Record<string, unknown>): Record<string, unknown> {
  return {
    text: '1 tablet every 6 hours as needed',
    doseAndRate: [{ doseQuantity }],
  };
}

describe('complex-type walk through repeating inline components (R5 Dosage)', () => {
  it('reaches doseQuantity.value and flags an out-of-range decimal', async () => {
    const issues = await createValidator().validateComplexTypeSubElements(
      buildDosage({ value: 1e300, unit: 'tablet', code: 'TAB' }),
      dosageElementDef,
      'MedicationRequest.dosageInstruction[0]',
      '',
      undefined,
      'R5',
    );

    const rangeIssue = issues.find(issue => issue.code === 'decimal-value-out-of-range');
    expect(rangeIssue).toBeDefined();
    expect(rangeIssue?.severity).toBe('warning');
    expect(rangeIssue?.path).toBe(
      'MedicationRequest.dosageInstruction[0].doseAndRate[0].doseQuantity.value',
    );
  });

  it('still type-validates the doseQuantity code path', async () => {
    const issues = await createValidator().validateComplexTypeSubElements(
      buildDosage({ value: 1, unit: 'tablet', code: 42 }),
      dosageElementDef,
      'MedicationRequest.dosageInstruction[0]',
      '',
      undefined,
      'R5',
    );

    const codeIssue = issues.find(issue =>
      issue.path === 'MedicationRequest.dosageInstruction[0].doseAndRate[0].doseQuantity.code');
    expect(codeIssue).toBeDefined();
    expect(codeIssue?.code).toBe('structural-primitive-type-mismatch');
  });

  it('reports no issues for a clean doseAndRate', async () => {
    const issues = await createValidator().validateComplexTypeSubElements(
      buildDosage({
        value: 1,
        unit: 'tablet',
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        code: 'TAB',
      }),
      dosageElementDef,
      'MedicationRequest.dosageInstruction[0]',
      '',
      undefined,
      'R5',
    );

    expect(issues).toEqual([]);
  });
});
