import type { BoundedLruCache } from '../cache/bounded-lru-cache';
import { resourceTypeOf } from '../core/fhir-resource';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { createValidationIssue } from '../issues';
import type { ValidationIssue } from '../types';
import { validateAgainstExtensionProfile } from './extension-profile-validation';
import {
  validateExtensionStructure,
  validateExtensionValueType,
} from './extension-structure-rules';
import type { ExtensionDefinition, ExtensionValidationContext } from './extension-types';
import { validateExtensionValueElements } from './extension-value-profile-validation';
import type { ElementRulesValidator } from './element-rules-validator';
import type { SDFHIRPathExecutor } from './sd-fhirpath-executor';
import type { TypeValidator } from './type-validator';
import type { ValueSetValidator } from './valueset-validator';

export interface ExtensionInstanceRuleDependencies {
  elementRulesValidator: ElementRulesValidator;
  extensionProfileCache: BoundedLruCache<string, StructureDefinition>;
  sdFHIRPathExecutor: SDFHIRPathExecutor;
  sdLoader: StructureDefinitionLoader;
  typeValidator: TypeValidator;
  valueSetValidator: ValueSetValidator;
}

interface ExtensionInstanceRuleInput {
  context: ExtensionValidationContext;
  definition: ExtensionDefinition | undefined;
  extension: Record<string, unknown>;
  extensionPath: string;
  extensionType: 'extension' | 'modifierExtension';
  skipUniversalChecks: boolean;
  url: string;
}

export async function validateExtensionInstanceRules(
  dependencies: ExtensionInstanceRuleDependencies,
  input: ExtensionInstanceRuleInput,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const resourceType = resourceTypeOf(input.context.resource, 'Unknown');

  if (!input.definition && input.context.strictMode) {
    issues.push(createValidationIssue({
      code: 'profile-extension-not-in-profile',
      path: input.extensionPath,
      resourceType,
      messageParams: { url: input.url, profileUrl: input.context.profileSD.url },
    }));
  }
  if (!input.skipUniversalChecks) {
    issues.push(...validateExtensionStructure(
      input.extension,
      input.extensionType,
      input.extensionPath,
      resourceType,
    ));
  }
  if (input.definition) {
    issues.push(...await validateDefinedExtension(
      dependencies,
      input.extension,
      input.definition,
      input.extensionType,
      input.extensionPath,
      input.context,
    ));
  }

  return issues;
}

async function validateDefinedExtension(
  dependencies: ExtensionInstanceRuleDependencies,
  extension: Record<string, unknown>,
  definition: ExtensionDefinition,
  extensionType: 'extension' | 'modifierExtension',
  extensionPath: string,
  context: ExtensionValidationContext,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const resourceType = resourceTypeOf(context.resource, 'Unknown');
  if (extensionType === 'modifierExtension' && !definition.isModifier) {
    issues.push(createValidationIssue({
      code: 'profile-extension-modifier-mismatch',
      path: extensionPath,
      resourceType,
      messageParams: { url: extension.url },
    }));
  }
  const valueTypeCodes = definition.typeCodes?.filter(type => type !== 'Extension') ?? [];
  if (valueTypeCodes.length > 0) {
    issues.push(...validateExtensionValueType(
      extension,
      valueTypeCodes,
      extensionPath,
      resourceType,
    ));
  }
  if (definition.inlineValueElement) {
    issues.push(...await validateExtensionValueElements({
      extension,
      valueElements: [definition.inlineValueElement],
      path: extensionPath,
      profileUrl: definition.ownerProfileUrl ?? context.profileUrl,
      context,
      typeValidator: dependencies.typeValidator,
      valueSetValidator: dependencies.valueSetValidator,
      elementRulesValidator: dependencies.elementRulesValidator,
    }));
  }
  if (definition.profileUrl) {
    issues.push(...await validateAgainstExtensionProfile({
      extension,
      profileUrl: definition.profileUrl,
      path: extensionPath,
      context,
      sdLoader: dependencies.sdLoader,
      typeValidator: dependencies.typeValidator,
      valueSetValidator: dependencies.valueSetValidator,
      elementRulesValidator: dependencies.elementRulesValidator,
      profileCache: dependencies.extensionProfileCache,
      sdFHIRPathExecutor: dependencies.sdFHIRPathExecutor,
    }));
  }
  return issues;
}
