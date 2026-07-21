import { describe, expect, it, vi } from 'vitest';
import { ComplexTypeValidator } from '../complex-type-validator';

describe('ComplexTypeValidator Period per-1', () => {
  const sdLoader = {
    loadProfile: vi.fn().mockResolvedValue(null),
  } as any;

  it('compares dateTime periods by instant so DST offsets do not look backwards', async () => {
    const validator = new ComplexTypeValidator(sdLoader);

    const issues = await validator.validateComplexTypeSubElements(
      {
        start: '2022-11-06T01:52:06-04:00',
        end: '2022-11-06T01:07:06-05:00',
      },
      {
        id: 'Encounter.period',
        path: 'Encounter.period',
        type: [{ code: 'Period' }],
      },
      'Encounter.period',
      'http://hl7.org/fhir/StructureDefinition/Encounter',
    );

    expect(issues.some(issue => issue.code === 'business-invalid-period-end')).toBe(false);
  });

  it('reuses effective datatype elements across repeated indexed parent paths', async () => {
    const codeableConceptSd = {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/CodeableConcept',
      name: 'CodeableConcept',
      status: 'active',
      kind: 'complex-type',
      abstract: false,
      type: 'CodeableConcept',
      snapshot: {
        element: [
          { path: 'CodeableConcept' },
          { path: 'CodeableConcept.coding', min: 0, max: '*', type: [{ code: 'Coding' }] },
          { path: 'CodeableConcept.text', min: 0, max: '1', type: [{ code: 'string' }] },
        ],
      },
    };
    const localLoader = {
      loadProfile: vi.fn().mockImplementation(async (url: string) =>
        url.endsWith('/CodeableConcept') ? codeableConceptSd : null
      ),
    };
    let parentPathReads = 0;
    const parentStructureDef = {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Claim',
      name: 'Claim',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Claim',
      snapshot: {
        element: Array.from({ length: 100 }, (_, index) => ({
          get path() {
            parentPathReads += 1;
            return `Claim.item.productOrService.extension${index}`;
          },
          min: 0,
          max: '1',
          type: [{ code: 'Extension' }],
        })),
      },
    };
    const validator = new ComplexTypeValidator(localLoader as any);
    const elementDef = {
      id: 'Claim.item.productOrService',
      path: 'Claim.item.productOrService',
      type: [{ code: 'CodeableConcept' }],
    };

    await validator.validateComplexTypeSubElements(
      { text: 'one' },
      elementDef,
      'Claim.item[0].productOrService',
      'http://hl7.org/fhir/StructureDefinition/Claim',
      parentStructureDef as any,
    );
    const readsAfterFirstPath = parentPathReads;

    await validator.validateComplexTypeSubElements(
      { text: 'two' },
      elementDef,
      'Claim.item[1].productOrService',
      'http://hl7.org/fhir/StructureDefinition/Claim',
      parentStructureDef as any,
    );

    expect(readsAfterFirstPath).toBeGreaterThan(0);
    expect(parentPathReads).toBe(readsAfterFirstPath);
  });

  it('preserves the requested FHIR version for nested primitive bindings', async () => {
    const backboneElementSd = {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/BackboneElement',
      name: 'BackboneElement',
      status: 'active',
      kind: 'complex-type',
      abstract: false,
      type: 'BackboneElement',
      snapshot: {
        element: [
          { path: 'BackboneElement' },
          {
            path: 'BackboneElement.type',
            min: 1,
            max: '1',
            type: [{ code: 'code' }],
            binding: {
              strength: 'required',
              valueSet: 'http://hl7.org/fhir/ValueSet/device-nametype',
            },
          },
        ],
      },
    };
    const localLoader = {
      loadProfile: vi.fn().mockResolvedValue(backboneElementSd),
    };
    const validator = new ComplexTypeValidator(localLoader as any);
    const validateBinding = vi
      .spyOn((validator as any).valueSetValidator, 'validateBinding')
      .mockResolvedValue([]);

    await validator.validateComplexTypeSubElements(
      { type: 'model-name' },
      {
        id: 'Device.deviceName',
        path: 'Device.deviceName',
        type: [{ code: 'BackboneElement' }],
      },
      'Device.deviceName[0]',
      'http://hl7.org/fhir/StructureDefinition/Device',
      undefined,
      'R4',
    );

    expect(validateBinding).toHaveBeenCalledWith(
      'model-name',
      expect.objectContaining({
        strength: 'required',
        valueSet: 'http://hl7.org/fhir/ValueSet/device-nametype',
      }),
      'Device.deviceName[0].type',
      expect.objectContaining({ fhirVersion: 'R4' }),
    );
  });

  it('still reports truly backwards dateTime periods', async () => {
    const validator = new ComplexTypeValidator(sdLoader);

    const issues = await validator.validateComplexTypeSubElements(
      {
        start: '2022-11-06T01:52:06-05:00',
        end: '2022-11-06T01:07:06-05:00',
      },
      {
        id: 'Encounter.period',
        path: 'Encounter.period',
        type: [{ code: 'Period' }],
      },
      'Encounter.period',
      'http://hl7.org/fhir/StructureDefinition/Encounter',
    );

    expect(issues.some(issue => issue.code === 'business-invalid-period-end')).toBe(true);
  });

  it('does not report mixed date/dateTime periods when ordering is clearly valid', async () => {
    const validator = new ComplexTypeValidator(sdLoader);

    const issues = await validator.validateComplexTypeSubElements(
      {
        start: '2024-06-14',
        end: '2026-06-29T05:43:22.238Z',
      },
      {
        id: 'Encounter.period',
        path: 'Encounter.period',
        type: [{ code: 'Period' }],
      },
      'Encounter.period',
      'http://hl7.org/fhir/StructureDefinition/Encounter',
    );

    expect(issues.some(issue => issue.code === 'business-invalid-period-end')).toBe(false);
  });

  it('reports mixed date/dateTime periods when start is definitely after end', async () => {
    const validator = new ComplexTypeValidator(sdLoader);

    const issues = await validator.validateComplexTypeSubElements(
      {
        start: '2026-06-30',
        end: '2026-06-29T05:43:22.238Z',
      },
      {
        id: 'Encounter.period',
        path: 'Encounter.period',
        type: [{ code: 'Period' }],
      },
      'Encounter.period',
      'http://hl7.org/fhir/StructureDefinition/Encounter',
    );

    expect(issues.some(issue => issue.code === 'business-invalid-period-end')).toBe(true);
  });

  it('does not report mixed date/dateTime periods when their precision ranges overlap', async () => {
    const validator = new ComplexTypeValidator(sdLoader);

    const issues = await validator.validateComplexTypeSubElements(
      {
        start: '2026-06-29T23:00:00Z',
        end: '2026-06-29',
      },
      {
        id: 'Encounter.period',
        path: 'Encounter.period',
        type: [{ code: 'Period' }],
      },
      'Encounter.period',
      'http://hl7.org/fhir/StructureDefinition/Encounter',
    );

    expect(issues.some(issue => issue.code === 'business-invalid-period-end')).toBe(false);
  });
});
