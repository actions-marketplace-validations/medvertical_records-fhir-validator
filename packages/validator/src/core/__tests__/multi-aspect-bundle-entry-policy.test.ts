import { describe, expect, it, vi } from 'vitest';

function deps() {
  return {
    sdLoader: {},
    snapshotGenerator: {},
    profileCache: {},
    structuralExecutor: { validate: vi.fn().mockResolvedValue([]) },
    profileExecutor: { validate: vi.fn().mockResolvedValue([]) },
    terminologyExecutor: { validate: vi.fn().mockResolvedValue([]) },
    referenceExecutor: { validate: vi.fn().mockResolvedValue([]) },
    invariantExecutor: { validate: vi.fn().mockResolvedValue([]) },
    customRuleExecutor: { validate: vi.fn().mockResolvedValue([]) },
    metadataExecutor: { validate: vi.fn().mockResolvedValue([]) },
    bestPracticeValidator: { validate: vi.fn().mockReturnValue([]) },
    strictMode: false,
  } as any;
}

function bundle() {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [{ resource: { resourceType: 'Patient', id: 'p1' } }],
  };
}

async function loadCallbackWithAppendMock(appendBundleEntryValidationResults: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock('../multi-aspect-bundle-entry-validation', () => ({
    appendBundleEntryValidationResults,
  }));
  vi.doMock('../profile-loader-utils', async () => {
    const actual = await vi.importActual<typeof import('../profile-loader-utils')>('../profile-loader-utils');
    return {
      ...actual,
      loadProfileOrBase: vi.fn().mockResolvedValue({
        structureDef: {
          resourceType: 'StructureDefinition',
          url: 'http://hl7.org/fhir/StructureDefinition/Bundle',
          type: 'Bundle',
          snapshot: { element: [] },
        },
        declaredProfileUrl: 'http://hl7.org/fhir/StructureDefinition/Bundle',
        usedBaseFallback: false,
      }),
    };
  });

  const { buildMultiAspectValidateCallback } = await import('../multi-aspect-validate-callback');
  return buildMultiAspectValidateCallback;
}

describe('multi-aspect Bundle entry validation policy', () => {
  it('appends Bundle entry validation results by default', async () => {
    const appendBundleEntryValidationResults = vi.fn().mockResolvedValue(undefined);
    const buildMultiAspectValidateCallback = await loadCallbackWithAppendMock(appendBundleEntryValidationResults);
    const validate = buildMultiAspectValidateCallback(deps(), ['structural'], {}, undefined);

    await validate(bundle(), 'http://hl7.org/fhir/StructureDefinition/Bundle', 'R4');

    expect(appendBundleEntryValidationResults).toHaveBeenCalledOnce();
  });

  it('skips Bundle entry validation when disabled by settings', async () => {
    const appendBundleEntryValidationResults = vi.fn().mockResolvedValue(undefined);
    const buildMultiAspectValidateCallback = await loadCallbackWithAppendMock(appendBundleEntryValidationResults);
    const validate = buildMultiAspectValidateCallback(
      deps(),
      ['structural'],
      { recursiveReferenceValidation: { validateBundleEntries: false } },
      undefined,
    );

    await validate(bundle(), 'http://hl7.org/fhir/StructureDefinition/Bundle', 'R4');

    expect(appendBundleEntryValidationResults).not.toHaveBeenCalled();
  });
});
