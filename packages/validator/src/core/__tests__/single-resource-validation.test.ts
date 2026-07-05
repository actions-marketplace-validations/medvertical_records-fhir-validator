import { describe, expect, it, vi } from 'vitest';
import {
  collectSingleResourceValidationIssues,
  shouldValidateBestPractices,
  shouldValidateBundleEntryResources,
} from '../single-resource-validation';
import type { ValidationIssue } from '../../types';

function issue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    id: 'bundle-entry-issue',
    aspect: 'terminology',
    severity: 'error',
    code: 'terminology-code-invalid',
    message: 'Invalid embedded issue',
    path: 'Bundle.entry[0].resource/*Observation/o1*/.valueQuantity.code',
    timestamp: new Date(),
    ...overrides,
  };
}

function deps(validateBundleEntriesIfNeeded = vi.fn().mockResolvedValue([issue()])) {
  return {
    structuralExecutor: { validate: vi.fn().mockResolvedValue([]) },
    profileExecutor: { validate: vi.fn().mockResolvedValue([]) },
    terminologyExecutor: { validate: vi.fn().mockResolvedValue([]) },
    invariantExecutor: { validate: vi.fn().mockResolvedValue([]) },
    customRuleExecutor: { validate: vi.fn().mockResolvedValue([]) },
    metadataExecutor: { validate: vi.fn().mockResolvedValue([]) },
    referenceExecutor: { validate: vi.fn().mockResolvedValue([]) },
    bestPracticeValidator: { validate: vi.fn().mockReturnValue([]) },
    validateBundleEntriesIfNeeded,
  } as any;
}

function input(settings?: any) {
  return {
    resource: { resourceType: 'Bundle', type: 'collection', entry: [] },
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/Bundle',
    fhirVersion: 'R4' as const,
    strictMode: false,
    settings,
    structureDef: {
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Bundle',
      type: 'Bundle',
      snapshot: { element: [] },
    } as any,
  };
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    aspects: {
      structural: { enabled: true, severity: 'inherit' },
      profile: { enabled: true, severity: 'inherit' },
      terminology: { enabled: true, severity: 'inherit' },
      reference: { enabled: true, severity: 'inherit' },
      invariant: { enabled: true, severity: 'inherit' },
      custom_rule: { enabled: true, severity: 'inherit' },
      metadata: { enabled: true, severity: 'inherit' },
      anomaly: { enabled: true, severity: 'inherit' },
    },
    ...overrides,
  };
}

describe('single-resource bundle entry validation policy', () => {
  it('validates Bundle entry resources by default', async () => {
    const validateBundleEntriesIfNeeded = vi.fn().mockResolvedValue([issue()]);
    const issues = await collectSingleResourceValidationIssues(
      input(),
      deps(validateBundleEntriesIfNeeded),
    );

    expect(validateBundleEntriesIfNeeded).toHaveBeenCalledOnce();
    expect(issues.map(i => i.code)).toContain('terminology-code-invalid');
  });

  it('skips Bundle entry resources when recursiveReferenceValidation.validateBundleEntries is false', async () => {
    const validateBundleEntriesIfNeeded = vi.fn().mockResolvedValue([issue()]);
    const issues = await collectSingleResourceValidationIssues(
      input({ recursiveReferenceValidation: { validateBundleEntries: false } }),
      deps(validateBundleEntriesIfNeeded),
    );

    expect(validateBundleEntriesIfNeeded).not.toHaveBeenCalled();
    expect(issues).toEqual([]);
  });

  it('exposes the settings decision for callers and focused tests', () => {
    expect(shouldValidateBundleEntryResources()).toBe(true);
    expect(shouldValidateBundleEntryResources({} as any)).toBe(true);
    expect(shouldValidateBundleEntryResources({
      recursiveReferenceValidation: { validateBundleEntries: true },
    } as any)).toBe(true);
    expect(shouldValidateBundleEntryResources({
      recursiveReferenceValidation: { validateBundleEntries: false },
    } as any)).toBe(false);
  });
});

describe('single-resource aspect settings policy', () => {
  it('does not execute disabled aspects or disabled best-practice checks', async () => {
    const validationDeps = deps(vi.fn().mockResolvedValue([]));
    const scopedSettings = settings({
      enableBestPracticeChecks: false,
      aspects: {
        structural: { enabled: true, severity: 'inherit' },
        profile: { enabled: true, severity: 'inherit' },
        terminology: { enabled: false, severity: 'inherit' },
        reference: { enabled: false, severity: 'inherit' },
        invariant: { enabled: false, severity: 'inherit' },
        custom_rule: { enabled: false, severity: 'inherit' },
        metadata: { enabled: false, severity: 'inherit' },
        anomaly: { enabled: false, severity: 'inherit' },
      },
    });

    await collectSingleResourceValidationIssues(
      input(scopedSettings),
      validationDeps,
    );

    expect(validationDeps.structuralExecutor.validate).toHaveBeenCalledOnce();
    expect(validationDeps.profileExecutor.validate).toHaveBeenCalledOnce();
    expect(validationDeps.terminologyExecutor.validate).not.toHaveBeenCalled();
    expect(validationDeps.referenceExecutor.validate).not.toHaveBeenCalled();
    expect(validationDeps.invariantExecutor.validate).not.toHaveBeenCalled();
    expect(validationDeps.customRuleExecutor.validate).not.toHaveBeenCalled();
    expect(validationDeps.metadataExecutor.validate).not.toHaveBeenCalled();
    expect(validationDeps.bestPracticeValidator.validate).not.toHaveBeenCalled();
  });

  it('exposes the best-practice settings decision for callers', () => {
    expect(shouldValidateBestPractices()).toBe(true);
    expect(shouldValidateBestPractices({} as any)).toBe(true);
    expect(shouldValidateBestPractices({ enableBestPracticeChecks: true } as any)).toBe(true);
    expect(shouldValidateBestPractices({ enableBestPracticeChecks: false } as any)).toBe(false);
  });
});
