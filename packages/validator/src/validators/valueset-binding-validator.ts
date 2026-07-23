import type { ValidationIssue } from '../types';
import type { Binding } from '../core/structure-definition-types';
import { createBindingViolation, createBindingUnverified } from '../issues';
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

export type ValidateBindingOptions = {
  valueSetUrl?: string;
  profileUrl?: string;
  fhirVersion?: FhirVersion;
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
}

/**
 * Validate a coded element against its binding.
 */
export async function validateBinding(
  deps: BindingValidationDeps,
  code: any,
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
    const codeInfos = extractCodeInfos(code);
    if (codeInfos.length === 0) {
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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn(`[ValueSetValidator] Binding validation failed, treating as unverified: ${err.message}`);
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
        severityOverride: strictRequired ? 'warning' : undefined,
      }));
    }
  }

  return issues;
}

async function validateExtractedCodeBindings(
  deps: BindingValidationDeps,
  rawCode: any,
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
    deps,
    rawCode,
    codeInfos,
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
    const severityOverride =
      strictRequired && binding.strength === 'required' ? 'warning' as const : undefined;
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

async function validateCodeSystemVersions(
  deps: BindingValidationDeps,
  rawCode: any,
  codeInfos: CodeInfo[],
  valueSetUrl: string,
  elementPath: string,
  options?: ValidateBindingOptions,
): Promise<ValidationIssue[]> {
  const versionedCodeInfos = codeInfos.filter(codeInfo => codeInfo.system && codeInfo.version);
  if (versionedCodeInfos.length === 0) return [];

  const valueSet = await deps.packageLoader.loadValueSetResource(valueSetUrl, options?.fhirVersion);
  const includes = valueSet?.compose?.include ?? [];
  const issues: ValidationIssue[] = [];

  for (const codeInfo of versionedCodeInfos) {
    const systemIncludes = includes.filter(include => include.system === codeInfo.system);
    const constrainedVersions = systemIncludes
      .map(include => include.version)
      .filter((version): version is string => Boolean(version) && version !== '*');
    if (
      constrainedVersions.length === 0 ||
      constrainedVersions.includes(codeInfo.version!) ||
      systemIncludes.some(include => !include.version)
    ) {
      continue;
    }

    const versionPath = Array.isArray(rawCode?.coding)
      ? `${elementPath}.coding[${codeInfo.codingIndex ?? 0}].version`
      : `${elementPath}.version`;
    issues.push(createBindingVersionMismatch({
      codeInfo,
      expectedVersions: constrainedVersions,
      valueSetUrl,
      versionPath,
      profileUrl: options?.profileUrl,
    }));
  }

  return issues;
}

function createBindingVersionMismatch({
  codeInfo,
  expectedVersions,
  valueSetUrl,
  versionPath,
  profileUrl,
}: {
  codeInfo: CodeInfo;
  expectedVersions: string[];
  valueSetUrl: string;
  versionPath: string;
  profileUrl?: string;
}): ValidationIssue {
  const expected = expectedVersions.join(', ');
  return {
    id: `terminology-codesystem-version-mismatch-${Date.now()}-${codeInfo.codingIndex ?? 0}`,
    aspect: 'terminology',
    severity: 'error',
    code: 'terminology-code-system-version-mismatch',
    message:
      `CodeSystem '${codeInfo.system}' version '${codeInfo.version}' does not match ` +
      `the version required by ValueSet '${valueSetUrl}' (${expected})`,
    path: versionPath,
    resourceType: resourceTypeFromElementPath(versionPath),
    profile: profileUrl,
    timestamp: new Date(),
    details: {
      code: codeInfo.code,
      system: codeInfo.system,
      actualVersion: codeInfo.version,
      expectedVersions,
      valueSet: valueSetUrl,
      fieldPath: versionPath,
      fixHint:
        `Use one of the CodeSystem versions required by the ValueSet (${expected}), ` +
        'or omit Coding.version when the binding does not require a version assertion.',
    },
  };
}

async function validateDisplaysForCodeInfos(
  deps: BindingValidationDeps,
  rawCode: any,
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
