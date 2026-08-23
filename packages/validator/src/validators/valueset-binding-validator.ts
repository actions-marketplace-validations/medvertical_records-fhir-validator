import type { ValidationIssue } from '../types';
import type { ValidationSeverity } from '@records-fhir/validation-types';
import type { Binding } from '../core/structure-definition-types';
import {
  createBindingViolation,
  createBindingUnverified,
  createValueSetUnavailable,
} from '../issues';
import { logger } from '../logger';

import type { TerminologyResolutionConfig, CodeBindingOutcome } from './valueset-types';
import { extractCodeInfo, extractCodeInfos } from './valueset-code-info';
import {
  resourceTypeFromElementPath,
  type BindingStrength,
  type CodeInfo,
} from './valueset-display-utils';
import { type FhirVersion } from './valueset-expansion-cache-key';
import { validateDisplayMatchesCodeSystem } from './valueset-display-validator';
import type { ValueSetCache } from './valueset-cache';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import { validateCodeSystemVersions } from './valueset-binding-version-validator';
import { validationFailureMetadata } from '../utils/validation-execution-failure';

export type ValidateBindingOptions = {
  valueSetUrl?: string;
  profileUrl?: string;
  fhirVersion?: FhirVersion;
  unverifiedSeverity?: ValidationSeverity;
};

/**
 * Collaborators the binding-validation flow needs from ValueSetValidator,
 * passed explicitly so this module stays free of the validator's other state.
 */
export interface BindingValidationDeps {
  resolutionConfig: TerminologyResolutionConfig;
  cache: ValueSetCache;
  packageLoader: ValueSetPackageLoader;
  resolveCodeBindingForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome>;
  isValueSetAvailable(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<boolean>;
}

/**
 * Validate a coded element against its binding.
 */
export async function validateBinding(
  deps: BindingValidationDeps,
  code: unknown,
  binding: Binding | undefined,
  elementPath: string,
  options?: ValidateBindingOptions,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (!binding || !binding.valueSet) {
    return issues;
  }

  if (binding.strength === 'example') {
    return issues;
  }

  try {
    const valueSetUrl = options?.valueSetUrl || binding.valueSet;
    const codeInfos = extractCodeInfos(code);
    if (codeInfos.length === 0) {
      if (!valueSetUrl) return issues;

      const strictRequired = deps.resolutionConfig.strictUnverifiedRequiredBindings
        && binding.strength === 'required';
      const shouldReport = deps.resolutionConfig.reportUnverifiedBindings || strictRequired;
      if (
        shouldReport
        && !await deps.isValueSetAvailable(valueSetUrl, options?.fhirVersion)
      ) {
        issues.push(createValueSetUnavailable({
          strength: binding.strength as 'required' | 'extensible' | 'preferred',
          valueSet: valueSetUrl,
          path: elementPath,
          resourceType: resourceTypeFromElementPath(elementPath),
          profile: options?.profileUrl,
          severityOverride: options?.unverifiedSeverity ?? (strictRequired ? 'warning' : undefined),
        }));
      }
      return issues;
    }

    issues.push(...await validateExtractedCodeBindings(
      deps,
      code,
      codeInfos,
      binding,
      elementPath,
      options,
    ));

  } catch (error: unknown) {
    logger.warn(
      '[ValueSetValidator] Binding validation failed, treating as unverified',
      validationFailureMetadata(error),
    );
    const codeInfo = extractCodeInfo(code);
    const strictRequired = deps.resolutionConfig.strictUnverifiedRequiredBindings
      && binding.strength === 'required';
    if (
      codeInfo
      && (deps.resolutionConfig.reportUnverifiedBindings || strictRequired)
    ) {
      issues.push(createBindingUnverified({
        strength: binding.strength as 'required' | 'extensible' | 'preferred',
        code: codeInfo.code,
        system: codeInfo.system,
        valueSet: binding.valueSet,
        path: elementPath,
        resourceType: resourceTypeFromElementPath(elementPath),
        profile: options?.profileUrl,
        severityOverride: options?.unverifiedSeverity ?? (strictRequired ? 'warning' : undefined),
      }));
    }
  }

  return issues;
}

async function validateExtractedCodeBindings(
  deps: BindingValidationDeps,
  rawCode: unknown,
  codeInfos: CodeInfo[],
  binding: Binding,
  elementPath: string,
  options?: ValidateBindingOptions,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const valueSetUrl = options?.valueSetUrl || binding.valueSet;
  if (!valueSetUrl) return issues;

  const validCodeInfos: CodeInfo[] = [];
  const unverifiedCodeInfos: CodeInfo[] = [];
  const firstCodeInfo = codeInfos[0];
  const codedDatatypeRequiresSystem =
    rawCode !== null && typeof rawCode === 'object' && !Array.isArray(rawCode);

  issues.push(...await validateCodeSystemVersions(
    deps.packageLoader,
    rawCode,
    codeInfos,
    binding.strength as BindingStrength,
    valueSetUrl,
    elementPath,
    options,
  ));

  for (const codeInfo of codeInfos) {
    // A code primitive inherits the CodeSystem from its binding, but a Coding
    // inside Coding/CodeableConcept does not. Without Coding.system it cannot
    // prove membership in a required ValueSet even when the bare code text
    // happens to occur in the local expansion.
    if (binding.strength === 'required' && codedDatatypeRequiresSystem && !codeInfo.system) {
      continue;
    }
    const outcome = await deps.resolveCodeBindingForBinding(
      codeInfo.code,
      codeInfo.system,
      valueSetUrl,
      binding.strength as BindingStrength,
      options?.fhirVersion,
      elementPath,
    );

    if (outcome === 'valid') {
      validCodeInfos.push(codeInfo);
    } else if (outcome === 'unverified') {
      // Fail open (count as valid for the violation decision below) but
      // keep a record so the skip can be surfaced as informational.
      validCodeInfos.push(codeInfo);
      unverifiedCodeInfos.push(codeInfo);
    }
  }

  const strictRequired = deps.resolutionConfig.strictUnverifiedRequiredBindings;
  if (
    (deps.resolutionConfig.reportUnverifiedBindings || strictRequired)
    && binding.strength !== 'example'
  ) {
    // Strict policy raises only unverifiable *required* bindings to warning;
    // extensible/preferred stay informational (gap P-3 step c).
    const severityOverride = options?.unverifiedSeverity
      ?? (strictRequired && binding.strength === 'required' ? 'warning' as const : undefined);
    for (const codeInfo of unverifiedCodeInfos) {
      issues.push(createBindingUnverified({
        strength: binding.strength as 'required' | 'extensible' | 'preferred',
        code: codeInfo.code,
        system: codeInfo.system,
        valueSet: valueSetUrl,
        path: elementPath,
        resourceType: resourceTypeFromElementPath(elementPath),
        profile: options?.profileUrl,
        severityOverride,
      }));
    }
  }

  issues.push(...await validateDisplaysForCodeInfos(
    deps,
    rawCode,
    validCodeInfos,
    valueSetUrl,
    binding,
    elementPath,
    options,
  ));

  if (
    validCodeInfos.length === 0
    && firstCodeInfo
    && (binding.strength === 'required' || binding.strength === 'extensible' || binding.strength === 'preferred')
  ) {
    issues.push(createBindingViolation({
      strength: binding.strength as 'required' | 'extensible' | 'preferred' | 'example',
      code: firstCodeInfo.code,
      system: firstCodeInfo.system,
      valueSet: valueSetUrl,
      path: elementPath,
      resourceType: resourceTypeFromElementPath(elementPath),
      profile: options?.profileUrl,
    }));
  }

  return issues;
}

async function validateDisplaysForCodeInfos(
  deps: BindingValidationDeps,
  rawCode: unknown,
  codeInfos: CodeInfo[],
  valueSetUrl: string,
  binding: Binding,
  elementPath: string,
  options?: ValidateBindingOptions,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const codeInfo of codeInfos) {
    const displayIssue = await validateDisplayMatchesCodeSystem(
      rawCode,
      codeInfo,
      valueSetUrl,
      elementPath,
      {
        bindingStrength: binding.strength as BindingStrength | undefined,
        profileUrl: options?.profileUrl,
        fhirVersion: options?.fhirVersion,
        cache: deps.cache,
        packageLoader: deps.packageLoader,
      },
    );
    if (displayIssue) {
      issues.push(displayIssue);
    }
  }
  return issues;
}
