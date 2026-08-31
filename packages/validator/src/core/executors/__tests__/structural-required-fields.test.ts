import { describe, expect, it, vi } from 'vitest';
import type { StructureDefinition } from '../../structure-definition-types';
import { validateRequiredSnapshotFields } from '../structural-required-fields';

function structureDefinition(
  elements: unknown[],
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: 'https://example.org/StructureDefinition/TestPatient',
    type: 'Patient',
    snapshot: { element: elements },
  } as StructureDefinition;
}

function complexTypeValidator() {
  return {
    validateComplexTypeSubElements: vi.fn().mockResolvedValue([]),
  };
}

describe('validateRequiredSnapshotFields', () => {
  it('creates deterministic missing-field findings', async () => {
    const input = {
      resource: { resourceType: 'Patient' },
      structureDef: structureDefinition([{ path: 'Patient.name', min: 1 }]),
      profileUrl: 'https://example.org/StructureDefinition/TestPatient',
      getValueAtPath: () => undefined,
      fhirVersion: 'R4' as const,
      complexTypeValidator: complexTypeValidator() as never,
    };

    const first = await validateRequiredSnapshotFields(input);
    const second = await validateRequiredSnapshotFields(input);

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]).toMatchObject({
      code: 'required-element-missing',
      path: 'Patient.name',
      profile: input.profileUrl,
    });
  });

  it('skips malformed snapshot entries and continues with valid definitions', async () => {
    const issues = await validateRequiredSnapshotFields({
      resource: { resourceType: 'Patient' },
      structureDef: structureDefinition([
        null,
        'invalid',
        { min: 1 },
        { path: 'Patient.name', min: 1 },
      ]),
      profileUrl: 'https://example.org/Profile',
      getValueAtPath: () => undefined,
      fhirVersion: 'R4',
      complexTypeValidator: complexTypeValidator() as never,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('Patient.name');
  });

  it('isolates one failing element and still validates later required fields', async () => {
    const validator = complexTypeValidator();
    validator.validateComplexTypeSubElements.mockImplementation(
      async (_value, _definition, path) => {
        if (path === 'Patient.name[0]') throw new Error('complex validation failed');
        return [];
      },
    );
    const issues = await validateRequiredSnapshotFields({
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'Example' }],
      },
      structureDef: structureDefinition([
        { path: 'Patient.name', min: 1 },
        { path: 'Patient.birthDate', min: 1 },
      ]),
      profileUrl: 'https://example.org/Profile',
      getValueAtPath: () => undefined,
      fhirVersion: 'R4',
      complexTypeValidator: validator as never,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'validation-error',
        path: 'Patient.name',
      }),
      expect.objectContaining({
        code: 'required-element-missing',
        path: 'Patient.birthDate',
      }),
    ]));
  });
});
