import { computeValidationIssueId } from '@records-fhir/validation-types';
import { getValidationTargets, shouldValidateRequired } from '../../business-rules';
import type { ProfileSourceContext } from '../../persistence';
import type { ValidationIssue } from '../../types';
import type { ValueSetCache } from '../../validators/valueset-cache';
import type { ElementDefinition, StructureDefinition } from '../structure-definition-types';
import { additionalBindingsForElement } from './terminology-additional-bindings';
import { pinBindingToDependencyPins } from './terminology-binding-dependency-pins';
import {
  applyValueSetSliceMembershipPolicy,
  effectiveBindingForElement,
  pinBindingToProfileVersion,
  selectSliceScopedValues,
  selectValuesForBinding,
  shouldSuppressNonRequiredBindingForOwnFixedPattern,
  shouldSuppressValueSetSliceMembershipIssue,
  shouldValidateBindingForValue,
} from './terminology-binding-selection';
import { getElementTypeCodes, getResourceType, isDirectResourceElementPath } from './terminology-executor-helpers';
import { validateExternalCodeSystems } from './terminology-external-code-system-rules';
import { UCUM_BEARING_TYPES, validateUcumAtPath } from './terminology-ucum-rules';
import type { TerminologySlicePlanCache } from './terminology-slice-plan-cache';
import type { CodeSystemReferenceLookupCache } from './terminology-code-system-reference-rules';
import type { UcumCodeValidator } from '../../validators/ucum-validator';
import type { TerminologyBindingValidationPort, TerminologyValidationPort } from './terminology-validation-port';

export interface TerminologyElementValidationParams {
  resource: unknown;
  elementDef: ElementDefinition;
  structureDef: StructureDefinition;
  getValueAtPath: (resource: unknown, path: string) => unknown;
  profileUrl?: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  sourceContext?: ProfileSourceContext;
}

interface TerminologyElementValidationDeps {
  valueSetCache: ValueSetCache;
  valueSetValidator: TerminologyValidationPort;
  slicePlanCache: TerminologySlicePlanCache;
  codeSystemReferenceLookupCache: CodeSystemReferenceLookupCache;
  ucumValidator: UcumCodeValidator;
}

export async function validateTerminologyElement(
  params: TerminologyElementValidationParams,
  deps: TerminologyElementValidationDeps,
): Promise<ValidationIssue[]> {
  const { resource, elementDef, fhirVersion, sourceContext } = params;
  const issues = elementDef.binding
    ? await validateElementBinding(params, deps.valueSetValidator, deps.slicePlanCache)
    : [];
  const path = elementDef.path;
  const elementTypes = getElementTypeCodes(elementDef);

  if (elementTypes.includes('CodeableConcept')) {
    const targets = getValidationTargets(resource, path).filter(
      (target) => target.value !== null && target.value !== undefined,
    );
    for (const target of targets) {
      const concept = asRecord(target.value);
      if (!Array.isArray(concept?.coding)) continue;
      issues.push(
        ...(await validateExternalCodeSystems(
          concept.coding,
          `${target.fullPath}.coding`,
          deps.valueSetValidator,
          fhirVersion,
          sourceContext,
          deps.valueSetCache,
          deps.codeSystemReferenceLookupCache,
          deps.ucumValidator,
        )),
      );
    }
  } else if (elementTypes.includes('Coding')) {
    const targets = getValidationTargets(resource, path).filter(
      (target) => target.value !== null && target.value !== undefined,
    );
    for (const target of targets) {
      issues.push(
        ...(await validateExternalCodeSystems(
          target.value,
          target.fullPath,
          deps.valueSetValidator,
          fhirVersion,
          sourceContext,
          deps.valueSetCache,
          deps.codeSystemReferenceLookupCache,
          deps.ucumValidator,
        )),
      );
    }
  }

  if (elementTypes.some((type) => UCUM_BEARING_TYPES.has(type))) {
    issues.push(...validateUcumAtPath(resource, elementDef, path, deps.ucumValidator));
  }
  return issues;
}

async function validateElementBinding(
  params: TerminologyElementValidationParams,
  valueSetValidator: TerminologyBindingValidationPort,
  slicePlanCache: TerminologySlicePlanCache,
): Promise<ValidationIssue[]> {
  const { resource, elementDef, structureDef, getValueAtPath } = params;
  const path = elementDef.path;
  const sliceSelection = selectSliceScopedValues(resource, elementDef, structureDef, getValueAtPath, slicePlanCache);
  if (sliceSelection && !sliceSelection.hasMatchingSliceElements) return [];
  const value = sliceSelection
    ? sliceSelection.values.length === 0
      ? undefined
      : sliceSelection.values.length === 1
        ? sliceSelection.values[0]
        : sliceSelection.values
    : getValueAtPath(resource, path);

  if (elementDef.binding?.strength === 'required' && (elementDef.min ?? 0) > 0) {
    const missing =
      (value === null || value === undefined) &&
      shouldValidateRequired(resource, path) &&
      (Boolean(sliceSelection) || isDirectResourceElementPath(path, getResourceType(resource, structureDef)));
    if (missing) return [createMissingRequiredBindingIssue(params)];
  }
  if (value === null || value === undefined || !shouldValidateBindingForValue(elementDef, value)) return [];

  const issues: ValidationIssue[] = [];
  const validateCandidate = await createCandidateBindingValidator(params, valueSetValidator, slicePlanCache);
  if (!sliceSelection) {
    const targets = getValidationTargets(resource, path)
      .filter((target) => target.value !== null && target.value !== undefined)
      .filter((target) => shouldValidateBindingForValue(elementDef, target.value));
    if (targets.length > 0) {
      for (const target of targets) {
        for (const candidate of selectValuesForBinding(elementDef, target.value, structureDef, slicePlanCache)) {
          if (shouldSuppressNonRequiredBindingForOwnFixedPattern(elementDef, candidate)) continue;
          issues.push(...(await validateCandidate(candidate, target.fullPath)));
        }
      }
      return issues;
    }
  }

  const perCandidateIssues: ValidationIssue[][] = [];
  for (const candidate of selectValuesForBinding(elementDef, value, structureDef, slicePlanCache)) {
    if (shouldSuppressNonRequiredBindingForOwnFixedPattern(elementDef, candidate)) continue;
    perCandidateIssues.push(await validateCandidate(candidate, path));
  }
  issues.push(
    ...applyValueSetSliceMembershipPolicy(elementDef, structureDef, perCandidateIssues, slicePlanCache),
  );
  return issues;
}

async function createCandidateBindingValidator(
  params: TerminologyElementValidationParams,
  valueSetValidator: TerminologyBindingValidationPort,
  slicePlanCache: TerminologySlicePlanCache,
): Promise<(candidate: unknown, path: string) => Promise<ValidationIssue[]>> {
  const { elementDef, structureDef, profileUrl, fhirVersion } = params;
  // Same-IG pin first (the profile's own version), then the dependency pins
  // of the profile's source package for cross-IG canonicals.
  const effectiveBinding = await pinBindingToDependencyPins(
    pinBindingToProfileVersion(effectiveBindingForElement(elementDef), structureDef),
    structureDef,
    fhirVersion,
  );
  const additionalBindings = await Promise.all(
    additionalBindingsForElement(elementDef)
      .map(binding => pinBindingToDependencyPins(
        pinBindingToProfileVersion(binding, structureDef),
        structureDef,
        fhirVersion,
      )),
  );
  return async (candidate, path) => {
    const issues: ValidationIssue[] = [];
    const primary = await valueSetValidator.validateBinding(candidate, effectiveBinding, path, {
      profileUrl,
      fhirVersion,
    });
    if (!shouldSuppressValueSetSliceMembershipIssue(elementDef, structureDef, primary, slicePlanCache)) {
      issues.push(...primary);
    }
    for (const binding of additionalBindings) {
      issues.push(
        ...(await valueSetValidator.validateBinding(candidate, binding, path, {
          profileUrl,
          fhirVersion,
          unverifiedSeverity: 'warning',
        })),
      );
    }
    return issues;
  };
}

function createMissingRequiredBindingIssue(params: TerminologyElementValidationParams): ValidationIssue {
  const { resource, elementDef, structureDef, profileUrl } = params;
  const path = elementDef.path;
  const resourceType = getResourceType(resource, structureDef);
  const message = `Required binding for '${path}' is missing (binding strength: required)`;
  const details = { bindingStrength: 'required', fieldPath: path };
  return {
    id: computeValidationIssueId({
      aspect: 'terminology',
      severity: 'error',
      code: 'binding-required-missing',
      path,
      resourceType,
      message,
      profile: profileUrl,
      details,
    }),
    aspect: 'terminology',
    severity: 'error',
    code: 'binding-required-missing',
    message,
    path,
    timestamp: new Date(),
    profile: profileUrl,
    details,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
