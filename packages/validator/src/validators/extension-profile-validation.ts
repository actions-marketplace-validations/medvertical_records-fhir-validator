import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import type { ElementDefinition, StructureDefinition } from '../core/structure-definition-types';
import { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { logger } from '../logger';
import { TypeValidator } from './type-validator';
import { ValueSetValidator } from './valueset-validator';
import { ElementRulesValidator } from './element-rules-validator';
import { extractSubExtensionDefinitions } from './extension-definition-extractor';
import type { ExtensionDefinition, ExtensionValidationContext } from './extension-types';
import { sdFHIRPathExecutor } from './sd-fhirpath-executor';

interface ValidateExtensionProfileParams {
  extension: any;
  profileUrl: string;
  path: string;
  context: ExtensionValidationContext;
  sdLoader: StructureDefinitionLoader;
  typeValidator: TypeValidator;
  valueSetValidator: ValueSetValidator;
  elementRulesValidator: ElementRulesValidator;
  profileCache: Map<string, StructureDefinition | null>;
}

export async function getSubExtensionDefinitions(
  parentProfileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  sdLoader: StructureDefinitionLoader,
  cache: Map<string, Map<string, ExtensionDefinition>>,
): Promise<Map<string, ExtensionDefinition>> {
  const cached = cache.get(parentProfileUrl);
  if (cached) return cached;

  let parentSD: StructureDefinition | null = null;
  try {
    parentSD = await sdLoader.loadProfile(parentProfileUrl, fhirVersion);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn(
      `[ExtensionValidator] Failed to load parent extension profile ${parentProfileUrl}: ${err.message}`
    );
  }

  const result = new Map<string, ExtensionDefinition>();
  if (!parentSD) {
    cache.set(parentProfileUrl, result);
    return result;
  }

  for (const [url, definition] of extractSubExtensionDefinitions(parentSD)) {
    result.set(url, definition);
  }

  cache.set(parentProfileUrl, result);
  logger.debug(
    `[ExtensionValidator] Extracted ${result.size} sub-extension definitions from ${parentProfileUrl}`
  );
  return result;
}

export async function validateAgainstExtensionProfile({
  extension,
  profileUrl,
  path,
  context,
  sdLoader,
  typeValidator,
  valueSetValidator,
  elementRulesValidator,
  profileCache,
}: ValidateExtensionProfileParams): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  let structureDef = profileCache.get(profileUrl);
  if (structureDef === undefined) {
    try {
      structureDef = await sdLoader.loadProfile(profileUrl, context.fhirVersion);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[ExtensionValidator] Failed to load extension profile ${profileUrl}: ${err.message}`);
      structureDef = null;
    }
    profileCache.set(profileUrl, structureDef);
  }

  if (!structureDef?.snapshot?.element) {
    return issues;
  }

  // Extension profiles can declare invariants on their root element. Those
  // constraints are not copied into the containing resource profile's
  // snapshot, so they must be evaluated against the extension instance
  // itself (the same recursive profile step performed by the reference
  // validator). Keep only constraint diagnostics here; the element-level
  // fixed/type/binding rules are handled below and must not be duplicated.
  const extensionResource = {
    resourceType: 'Extension',
    ...extension,
  };
  const constraintIssues = await sdFHIRPathExecutor.execute({
    resource: extensionResource,
    rootResource: context.resource,
    resourceType: 'Extension',
    structureDef,
    fhirVersion: context.fhirVersion,
  });
  issues.push(...constraintIssues
    .filter(issue => Boolean(issue.ruleId))
    .map(issue => rebaseExtensionConstraintIssue(
      issue,
      path,
      context.resource?.resourceType || 'Unknown',
    )));

  const valueElements = structureDef.snapshot.element.filter(
    (el) => el.path?.startsWith('Extension.value')
  );

  issues.push(...await validateExtensionValueElements({
    extension,
    valueElements,
    path,
    profileUrl,
    context,
    typeValidator,
    valueSetValidator,
    elementRulesValidator,
  }));

  return issues;
}

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
  extension: any;
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

  if (valueElements.length === 0) {
    return issues;
  }

  if (valueKeys.length === 0) {
    const requiredElement = valueElements.find((el) => (el.min ?? 0) > 0);
    if (requiredElement) {
      issues.push(createValidationIssue({
        code: 'profile-extension-missing-value',
        path,
        resourceType: context.resource?.resourceType || 'Unknown',
        profile: profileUrl,
        messageParams: { url: extension.url, requiredPath: requiredElement.path },
      }));
    }
    return issues;
  }

  const valueKey = valueKeys[0];
  const value = extension[valueKey];
  const inferredType = valueKey.replace('value', '');

  const matchingElement =
    valueElements.find((el) =>
      (el.type || []).some((t) => t.code === inferredType || t.code === inferredType.toLowerCase())
    ) || valueElements[0];

  issues.push(
    ...(await typeValidator.validate(
      value,
      matchingElement.type || [],
      `${path}.${valueKey}`,
      profileUrl
    ))
  );

  issues.push(
    ...elementRulesValidator.validate(
      value,
      matchingElement,
      `${path}.${valueKey}`,
      profileUrl
    )
  );

  if (matchingElement.binding) {
    issues.push(
      ...(await valueSetValidator.validateBinding(
        value,
        matchingElement.binding,
        `${path}.${valueKey}`
      ))
    );
  }

  return issues;
}

function rebaseExtensionConstraintIssue(
  issue: ValidationIssue,
  extensionPath: string,
  resourceType: string,
): ValidationIssue {
  const issuePath = issue.path || 'Extension';
  const rebasedPath = issuePath === 'Extension'
    ? extensionPath
    : issuePath.startsWith('Extension.')
      ? `${extensionPath}${issuePath.slice('Extension'.length)}`
      : extensionPath;
  return {
    ...issue,
    path: rebasedPath,
    resourceType,
    details: {
      ...(typeof issue.details === 'object' && issue.details !== null ? issue.details : {}),
      fieldPath: rebasedPath,
      resourceType,
    },
  };
}
