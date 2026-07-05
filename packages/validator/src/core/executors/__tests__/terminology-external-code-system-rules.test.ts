import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { validateExternalCodeSystems } from '../terminology-external-code-system-rules';
import { valueSetCache } from '../../../validators/valueset-cache';

describe('terminology external CodeSystem rules', () => {
  const originalPackageCachePath = process.env.FHIR_PACKAGE_CACHE_PATH;

  beforeEach(() => {
    valueSetCache.clear();
    process.env.FHIR_PACKAGE_CACHE_PATH = originalPackageCachePath;
  });

  afterEach(() => {
    valueSetCache.clear();
    process.env.FHIR_PACKAGE_CACHE_PATH = originalPackageCachePath;
  });

  it('surfaces remote CodeSystem budget exhaustion as an informational issue', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockResolvedValue({
        valid: true,
        reason: 'remote-budget-exhausted',
        message: 'Remote CodeSystem validation budget exhausted',
      }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system: 'http://loinc.org',
        code: '1234-5',
        display: 'Local label',
      },
      'Questionnaire.item.code',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      aspect: 'terminology',
      severity: 'information',
      code: 'terminology-codesystem-unverified',
      path: 'Questionnaire.item.code.code',
      details: {
        code: '1234-5',
        system: 'http://loinc.org',
        reason: 'remote-budget-exhausted',
      },
    });
  });

  it('downgrades Questionnaire-local choice codings without system to informational', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn(),
    };

    const issues = await validateExternalCodeSystems(
      {
        code: 'yes',
        display: 'Yes',
      },
      'Questionnaire.item[0].answerOption[0].valueCoding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      aspect: 'terminology',
      severity: 'information',
      code: 'terminology-coding-missing-system',
      path: 'Questionnaire.item[0].answerOption[0].valueCoding',
      details: {
        code: 'yes',
        display: 'Yes',
        fieldPath: 'Questionnaire.item[0].answerOption[0].valueCoding',
      },
    });
    expect(valuesetValidator.validateCodeInCodeSystem).not.toHaveBeenCalled();
  });

  it('downgrades Questionnaire enableWhen answerCoding without system to informational', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn(),
    };

    const issues = await validateExternalCodeSystems(
      { code: 'yes' },
      'Questionnaire.item[0].enableWhen[0].answerCoding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'information',
      code: 'terminology-coding-missing-system',
      path: 'Questionnaire.item[0].enableWhen[0].answerCoding',
    });
    expect(valuesetValidator.validateCodeInCodeSystem).not.toHaveBeenCalled();
  });

  it('does not call external CodeSystem validation for lexically invalid FHIR code values', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockResolvedValue({
        valid: false,
        reason: 'system-unresolvable',
      }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system: 'http://snomed.info/sct',
        code: ' 422650009',
        display: 'Social isolation (finding)',
      },
      'Condition.code.coding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toEqual([]);
    expect(valuesetValidator.validateCodeInCodeSystem).not.toHaveBeenCalled();
  });

  it('adds actionable guidance for relative Coding.system mnemonics', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockResolvedValue({ valid: true }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system: 'GPI',
        code: '66100020000330',
        display: 'IBUPROFEN TAB 600MG',
      },
      'MedicationDispense.medicationCodeableConcept.coding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'terminology-codesystem-unresolvable',
      path: 'MedicationDispense.medicationCodeableConcept.coding.system',
      details: expect.objectContaining({
        expectedSystemType: 'absolute CodeSystem URI',
        fixHint: expect.stringContaining("Coding.system 'GPI'"),
      }),
    }));
  });

  it('does not report not-found when local CodeSystem validation loads the package definition', async () => {
    const system = 'https://fhir.kbv.de/CodeSystem/KBV_CS_FOR_Section_Type';
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockImplementation(async () => {
        valueSetCache.setCodeSystem(system, {
          resourceType: 'CodeSystem',
          url: system,
          status: 'active',
          content: 'complete',
          concept: [{ code: 'Patient' }],
        } as any);
        return { valid: true };
      }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system,
        code: 'Patient',
      },
      'Composition.section[0].code.coding',
      valuesetValidator as any,
      'R4',
    );

    expect(valuesetValidator.validateCodeInCodeSystem).toHaveBeenCalledWith(
      'Patient',
      system,
      undefined,
      'R4',
    );
    expect(issues.filter(issue => issue.code === 'not-found')).toHaveLength(0);
  });

  it('does not report not-found when the CodeSystem exists in a local FHIR package', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'terminology-codesystem-'));
    const packageDir = path.join(root, 'kbv.ita.eau#1.1.0', 'package');
    await fs.mkdir(packageDir, { recursive: true });
    process.env.FHIR_PACKAGE_CACHE_PATH = root;

    const system = 'https://fhir.kbv.de/CodeSystem/KBV_CS_FOR_Section_Type';
    await fs.writeFile(
      path.join(packageDir, 'KBV_CS_FOR_Section_Type.json'),
      JSON.stringify({
        resourceType: 'CodeSystem',
        url: system,
        status: 'active',
        content: 'complete',
        concept: [{ code: 'ICD', display: 'ICD-Code' }],
      }),
    );

    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockResolvedValue({ valid: true }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system,
        code: 'ICD',
      },
      'Composition.section[0].code.coding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues.filter(issue => issue.code === 'not-found')).toHaveLength(0);
  });

  it('suggests urn:oid for bare OID Coding.system values', async () => {
    const valuesetValidator = {
      validateCodeInCodeSystem: vi.fn().mockResolvedValue({ valid: true }),
    };

    const issues = await validateExternalCodeSystems(
      {
        system: '2.16.840.1.113883.6.88',
        code: 'A',
      },
      'Observation.code.coding',
      valuesetValidator as any,
      'R4',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'terminology-codesystem-unresolvable',
      details: expect.objectContaining({
        suggestedSystem: 'urn:oid:2.16.840.1.113883.6.88',
        fixHint: expect.stringContaining('urn:oid:2.16.840.1.113883.6.88'),
      }),
    }));
  });
});
