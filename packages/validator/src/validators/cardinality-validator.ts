/* eslint-disable max-lines-per-function */
import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import type { ElementDefinition } from '../core/structure-definition-types';
import { shouldValidateRequired, getValidationTargets } from '../business-rules';
import { logger } from '../logger';

const CHOICE_BASES = [
  'value', 'effective', 'onset', 'abatement', 'deceased', 'multipleBirth',
  'defaultValue', 'medication', 'reported', 'occurrence', 'timing',
  'product', 'serviced', 'location', 'allowed', 'used',
  'rate', 'born', 'age',
];

const CONFORMANCE_RESOURCE_TYPES = new Set([
  'ActivityDefinition',
  'CapabilityStatement',
  'ChargeItemDefinition',
  'CodeSystem',
  'CompartmentDefinition',
  'ConceptMap',
  'EventDefinition',
  'ExampleScenario',
  'GraphDefinition',
  'ImplementationGuide',
  'Library',
  'Measure',
  'MessageDefinition',
  'NamingSystem',
  'OperationDefinition',
  'PlanDefinition',
  'Questionnaire',
  'SearchParameter',
  'StructureDefinition',
  'StructureMap',
  'TerminologyCapabilities',
  'ValueSet',
]);

interface CardinalityValidationOptions {
  parentExists?: boolean;
}

function hasChoiceValue(element: any, base: string): boolean {
  if (!element || typeof element !== 'object') return false;
  if (element[base] !== undefined && element[base] !== null) return true;

  return Object.keys(element).some(key =>
    key.startsWith(base) &&
    key.length > base.length &&
    key[base.length] === key[base.length].toUpperCase() &&
    element[key] !== undefined &&
    element[key] !== null
  );
}

function hasAnyChoiceValue(element: any): boolean {
  return CHOICE_BASES.some(base => hasChoiceValue(element, base));
}

function shouldSkipObservationAlternativeMustSupport(resource: any, path: string): boolean {
  if (!resource || resource.resourceType !== 'Observation') return false;

  if (/^Observation\.value\[x\]$/i.test(path)) {
    return (resource.dataAbsentReason !== undefined && resource.dataAbsentReason !== null) ||
      (Array.isArray(resource.component) && resource.component.some(hasAnyChoiceValue));
  }

  if (/^Observation\.component$/i.test(path)) {
    return hasChoiceValue(resource, 'value') ||
      (resource.dataAbsentReason !== undefined && resource.dataAbsentReason !== null);
  }

  if (/^Observation\.dataAbsentReason$/i.test(path)) {
    return hasChoiceValue(resource, 'value') ||
      (Array.isArray(resource.component) && resource.component.some(hasAnyChoiceValue));
  }

  if (/^Observation\.component(?::[^.]+)?\.dataAbsentReason$/i.test(path)) {
    return Array.isArray(resource.component) &&
      resource.component.length > 0 &&
      resource.component.every(hasAnyChoiceValue);
  }

  return false;
}

function shouldSkipContextualMustSupport(resource: any, path: string): boolean {
  if (!resource) return false;

  if (
    resource.resourceType === 'Observation' &&
    /^Observation\.(performer|specimen|interpretation|referenceRange)$/i.test(path)
  ) {
    return true;
  }

  if (resource.resourceType === 'DiagnosticReport' && /^DiagnosticReport\.resultsInterpreter$/i.test(path)) {
    return true;
  }

  if (resource.resourceType === 'Patient' && /^Patient\.address\.postalCode$/i.test(path)) {
    return true;
  }

  if (resource.resourceType === 'Encounter' && /^Encounter\.hospitalization$/i.test(path)) {
    const classCode = resource.class?.code;
    return typeof classCode === 'string' && classCode !== 'IMP';
  }

  if (resource.resourceType === 'Encounter' && /^Encounter\.reasonCode$/i.test(path)) {
    return (Array.isArray(resource.type) && resource.type.length > 0) ||
      (Array.isArray(resource.reasonReference) && resource.reasonReference.length > 0) ||
      (Array.isArray(resource.diagnosis) && resource.diagnosis.length > 0);
  }

  if (resource.resourceType === 'Patient' && /^Patient\.address\.period$/i.test(path)) {
    return !Array.isArray(resource.address) ||
      !resource.address.some((address: any) => address?.use === 'old');
  }

  return false;
}

function shouldSkipConformanceMustSupport(resource: any): boolean {
  return CONFORMANCE_RESOURCE_TYPES.has(resource?.resourceType);
}

function resourceTypeFromPath(path: string): string {
  const firstSegment = path.split('.')[0]?.replace(/\[[^\]]+\]/g, '');
  return firstSegment || 'Unknown';
}

function buildMinCardinalityFixHint(path: string, min: number, resource?: any): string {
  const contextualHint = buildPlanDefinitionRelatedActionTargetIdFixHint(path, resource);
  if (contextualHint) return contextualHint;

  return `Add '${path}' with at least ${min} value${min === 1 ? '' : 's'}.`;
}

function buildPlanDefinitionRelatedActionTargetIdFixHint(path: string, resource?: any): string | undefined {
  if (resource?.resourceType !== 'PlanDefinition') return undefined;
  if (!path.endsWith('.targetId') || !path.includes('.relatedAction[')) return undefined;

  const relatedAction = resolveIndexedPathParent(resource, path);
  const misplacedId = relatedAction?.id;
  if (typeof misplacedId !== 'string' || misplacedId.trim().length === 0 || relatedAction?.targetId !== undefined) {
    return undefined;
  }

  return `Add '${path}'. This relatedAction has element id '${misplacedId}' but no targetId; in FHIR R5, relatedAction.targetId is the required link to the related action. Move the workflow reference from id to targetId when '${misplacedId}' is meant to identify the target action.`;
}

function resolveIndexedPathParent(resource: any, path: string): any {
  const segments = path.split('.').slice(1, -1);
  let current = resource;

  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;

    const indexed = /^([A-Za-z][A-Za-z0-9]*)\[(\d+)\]$/.exec(segment);
    if (indexed) {
      const [, key, rawIndex] = indexed;
      const value = current[key];
      if (!Array.isArray(value)) return undefined;
      current = value[Number(rawIndex)];
      continue;
    }

    current = current[segment];
  }

  return current;
}

export class CardinalityValidator {
  private mustSupportSeverity: 'error' | 'warning' | 'information' = 'warning';

  setMustSupportSeverity(severity: 'error' | 'warning' | 'information'): void {
    this.mustSupportSeverity = severity;
  }

  validate(
    value: any,
    elementDef: ElementDefinition,
    path: string,
    profileUrl?: string,
    resource?: any,
    options: CardinalityValidationOptions = {},
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const min = elementDef.min ?? 0;
    const max = elementDef.max ?? '*';

    const count = this.getCount(value);

    if (value !== undefined && value !== null && !Array.isArray(value) && this.isRepeating(elementDef) && !path.match(/\[\d+\]$/)) {
      const elementName = path.split('.').pop() || path;
      issues.push(createValidationIssue({
        code: 'structural-validation-error',
        path,
        resourceType: resource?.resourceType || resourceTypeFromPath(path),
        profile: profileUrl,
        customMessage: `Element '${elementName}' must be an array (max cardinality is ${max})`,
        messageParams: { element: elementName, max },
        severityOverride: 'error',
      }));
    }

    if (count < min) {
      const shouldValidate = options.parentExists ?? (resource ? shouldValidateRequired(resource, path) : true);

      if (shouldValidate) {
        issues.push(createValidationIssue({
          code: 'structural-cardinality-min',
          path,
          resourceType: resource?.resourceType || resourceTypeFromPath(path),
          profile: profileUrl,
          messageParams: { element: path, actual: count, min },
          details: {
            fixHint: buildMinCardinalityFixHint(path, min, resource),
          },
        }));
      } else {
        logger.debug(
          `[CardinalityValidator] Skipping min cardinality check for '${path}' ` +
          `(parent doesn't exist - conditional cardinality)`
        );
      }
    }

    if (max !== '*') {
      const maxNum = parseInt(max, 10);
      if (!isNaN(maxNum) && count > maxNum) {
        issues.push(createValidationIssue({
          code: 'structural-cardinality-max',
          path,
          resourceType: resource?.resourceType || resourceTypeFromPath(path),
          profile: profileUrl,
          messageParams: { element: path, actual: count, max },
        }));
      }
    }

    if (elementDef.mustSupport === true) {
      const shouldValidateMustSupport = options.parentExists ?? (resource ? shouldValidateRequired(resource, path) : true);
      const shouldSkipObservationAlternative =
        shouldSkipObservationAlternativeMustSupport(resource, path);
      const shouldSkipContextual =
        shouldSkipContextualMustSupport(resource, path);
      const shouldSkipConformance =
        shouldSkipConformanceMustSupport(resource);

      if (
        shouldValidateMustSupport &&
        !shouldSkipObservationAlternative &&
        !shouldSkipContextual &&
        !shouldSkipConformance
      ) {
        let elementActuallyExists = count > 0;

        if (!elementActuallyExists && resource) {
          const validationTargets = getValidationTargets(resource, path);
          if (validationTargets.length > 0) {
            const hasNonEmptyValue = validationTargets.some(target => {
              const targetValue = target.value;
              if (targetValue === undefined || targetValue === null) {
                return false;
              }
              if (Array.isArray(targetValue)) {
                return targetValue.length > 0;
              }
              if (typeof targetValue === 'object') {
                return Object.keys(targetValue).length > 0;
              }
              if (typeof targetValue === 'string') {
                return targetValue.trim().length > 0;
              }
              return true;
            });
            elementActuallyExists = hasNonEmptyValue;
          }
        }

        const mustSupportIssues = this.validateMustSupport(
          value,
          count,
          path,
          profileUrl,
          elementActuallyExists,
          resource?.resourceType || resourceTypeFromPath(path)
        );
        issues.push(...mustSupportIssues);
      } else if (!shouldValidateMustSupport) {
        logger.debug(
          `[CardinalityValidator] Skipping mustSupport check for '${path}' ` +
          `(parent doesn't exist - conditional mustSupport)`
        );
      } else {
        logger.debug(
          `[CardinalityValidator] Skipping mustSupport check for '${path}' ` +
          `(contextual applicability rule matched)`
        );
      }
    }

    return issues;
  }

  private validateMustSupport(
    value: any,
    count: number,
    path: string,
    profileUrl?: string,
    elementActuallyExists?: boolean,
    resourceType?: string
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (count === 0 && elementActuallyExists !== true) {
      issues.push(createValidationIssue({
        code: 'profile-mustsupport-missing',
        path,
        resourceType: resourceType || resourceTypeFromPath(path),
        profile: profileUrl,
        messageParams: { element: path },
        severityOverride: this.mustSupportSeverity === 'information'
          ? 'info'
          : this.mustSupportSeverity,
      }));
    }

    return issues;
  }

  private getCount(value: any): number {
    if (value === undefined || value === null) {
      return 0;
    }

    if (Array.isArray(value)) {
      return value.length;
    }

    return 1;
  }

  isRequired(elementDef: ElementDefinition): boolean {
    return (elementDef.min ?? 0) > 0;
  }

  isRepeating(elementDef: ElementDefinition): boolean {
    const max = elementDef.max;
    if (max === undefined || max === null) {
      return false;
    }
    if (max === '*') {
      return true;
    }

    const maxNum = parseInt(max, 10);
    return !isNaN(maxNum) && maxNum > 1;
  }

  getCardinalityString(elementDef: ElementDefinition): string {
    const min = elementDef.min ?? 0;
    const max = elementDef.max ?? '*';
    return `${min}..${max}`;
  }
}
