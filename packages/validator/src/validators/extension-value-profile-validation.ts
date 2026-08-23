import { resolveFhirSegmentValue } from '../core/fhir-primitive-sidecar';
import { resourceTypeOf } from '../core/fhir-resource';
import type { ElementDefinition } from '../core/structure-definition-types';
import { createValidationIssue } from '../issues';
import type { ValidationIssue } from '../types';
import type { ElementRulesValidator } from './element-rules-validator';
import type { ExtensionValidationContext } from './extension-types';
import type { TypeValidator } from './type-validator';
import type { ValueSetValidator } from './valueset-validator';

/** Validate the concrete value[x] selected by an extension instance. */
export async function validateExtensionValueElements({
  extension,
  valueElements,
  path,
  profileUrl,
  context,
  typeValidator,
  valueSetValidator,
  elementRulesValidator,
}: {
  extension: Record<string, unknown>;
  valueElements: ElementDefinition[];
  path: string;
  profileUrl: string;
  context: ExtensionValidationContext;
  typeValidator: TypeValidator;
  valueSetValidator: ValueSetValidator;
  elementRulesValidator: ElementRulesValidator;
}): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const valueKeys = Object.keys(extension).filter((key) => key.startsWith('value'));

  if (valueElements.length === 0) return issues;

  if (valueKeys.length === 0) {
    const requiredElement = valueElements.find((el) => (el.min ?? 0) > 0);
    // A primitive value[x] present only through its underscore sidecar
    // (e.g. `_valueString` carrying a cqf-expression) still satisfies min=1.
    const sidecarOnlyValue = resolveFhirSegmentValue(extension, 'value[x]');
    if (requiredElement && sidecarOnlyValue === undefined) {
      issues.push(createValidationIssue({
        code: 'profile-extension-missing-value',
        path,
        resourceType: resourceTypeOf(context.resource, 'Unknown'),
        profile: profileUrl,
        messageParams: { url: extension.url, requiredPath: requiredElement.path },
      }));
    }
    return issues;
  }

  const valueKey = valueKeys[0];
  const value = extension[valueKey];
  const inferredType = valueKey.replace('value', '');
  const matchingElement = valueElements.find((el) =>
    (el.type || []).some((type) =>
      type.code === inferredType || type.code === inferredType.toLowerCase()))
    || valueElements[0];

  issues.push(...await typeValidator.validate(
    value,
    matchingElement.type || [],
    `${path}.${valueKey}`,
    profileUrl,
  ));
  issues.push(...elementRulesValidator.validate(
    value,
    matchingElement,
    `${path}.${valueKey}`,
    profileUrl,
  ));
  if (matchingElement.binding) {
    issues.push(...await valueSetValidator.validateBinding(
      value,
      matchingElement.binding,
      `${path}.${valueKey}`,
    ));
  }
  return issues;
}
