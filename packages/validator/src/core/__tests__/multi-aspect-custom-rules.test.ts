import { describe, expect, it, vi } from 'vitest';
import { buildMultiAspectValidateCallback } from '../multi-aspect-validate-callback';
import type { StructureDefinition } from '../structure-definition-types';

const PATIENT_PROFILE = 'http://hl7.org/fhir/StructureDefinition/Patient';

function createPatientStructureDefinition(): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: PATIENT_PROFILE,
    name: 'Patient',
    status: 'active',
    kind: 'resource',
    type: 'Patient',
    snapshot: {
      element: [
        { id: 'Patient', path: 'Patient', min: 0, max: '*' },
      ],
    },
  } as StructureDefinition;
}

function createDeps(customRuleValidate = vi.fn().mockResolvedValue([])) {
  const structureDef = createPatientStructureDefinition();
  const cache = new Map<string, unknown>();

  return {
    sdLoader: {
      loadProfile: vi.fn().mockResolvedValue(structureDef),
    },
    snapshotGenerator: {
      generateSnapshot: vi.fn(),
    },
    profileCache: {
      get: vi.fn((key: string) => cache.get(key)),
      set: vi.fn((key: string, value: unknown) => {
        cache.set(key, value);
      }),
    },
    structuralExecutor: { validate: vi.fn().mockResolvedValue([]) },
    profileExecutor: { validate: vi.fn().mockResolvedValue([]) },
    terminologyExecutor: { validate: vi.fn().mockResolvedValue([]) },
    referenceExecutor: { validate: vi.fn().mockResolvedValue([]) },
    invariantExecutor: { validate: vi.fn().mockResolvedValue([]) },
    customRuleExecutor: { validate: customRuleValidate },
    metadataExecutor: { validate: vi.fn().mockResolvedValue([]) },
    bestPracticeValidator: { validate: vi.fn().mockReturnValue([]) },
    strictMode: false,
  };
}

describe('multi-aspect custom rule execution', () => {
  it('does not call the custom rule source when auto-apply is disabled', async () => {
    const customRuleValidate = vi.fn().mockResolvedValue([]);
    const deps = createDeps(customRuleValidate);
    const validate = buildMultiAspectValidateCallback(
      deps as never,
      ['custom_rule', 'metadata'],
      { autoApplyCustomRules: false, aspects: {} },
      1,
    );

    await validate({ resourceType: 'Patient', id: 'p1' }, PATIENT_PROFILE, 'R4');

    expect(customRuleValidate).not.toHaveBeenCalled();
  });

  it('calls custom rules when auto-apply is enabled', async () => {
    const customRuleValidate = vi.fn().mockResolvedValue([]);
    const deps = createDeps(customRuleValidate);
    const validate = buildMultiAspectValidateCallback(
      deps as never,
      ['custom_rule', 'metadata'],
      { autoApplyCustomRules: true, aspects: {} },
      7,
    );

    await validate({ resourceType: 'Patient', id: 'p1' }, PATIENT_PROFILE, 'R4');

    expect(customRuleValidate).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 7,
      resource: expect.objectContaining({ resourceType: 'Patient' }),
    }));
  });
});
