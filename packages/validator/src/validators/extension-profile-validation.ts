import type { ValidationIssue } from '../types';
import { resourceTypeOf } from '../core/fhir-resource';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { logger } from '../logger';
import type { TypeValidator } from './type-validator';
import type { ValueSetValidator } from './valueset-validator';
import type { ElementRulesValidator } from './element-rules-validator';
import type { ExtensionValidationContext } from './extension-types';
import type { SDFHIRPathExecutor } from './sd-fhirpath-executor';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import type { ExtensionProfileCache } from './extension-profile-cache';
import { validateExtensionValueElements } from './extension-value-profile-validation';

interface ValidateExtensionProfileParams {
  extension: Record<string, unknown>;
  profileUrl: string;
  path: string;
  context: ExtensionValidationContext;
  sdLoader: StructureDefinitionLoader;
  typeValidator: TypeValidator;
  valueSetValidator: ValueSetValidator;
  elementRulesValidator: ElementRulesValidator;
  profileCache: ExtensionProfileCache<StructureDefinition>;
  sdFHIRPathExecutor: SDFHIRPathExecutor;
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
  sdFHIRPathExecutor,
}: ValidateExtensionProfileParams): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const profileCacheKey = `${context.fhirVersion}|${profileUrl}`;
  let structureDef: StructureDefinition | null | undefined = profileCache.get(profileCacheKey);
  if (structureDef === undefined) {
    try {
      structureDef = await sdLoader.loadProfile(profileUrl, context.fhirVersion);
    } catch (error: unknown) {
      logger.warn('[ExtensionValidator] Failed to load extension profile', {
        ...profileCanonicalMetadata(profileUrl),
        ...validationFailureMetadata(error),
      });
      structureDef = null;
    }
    if (structureDef) profileCache.set(profileCacheKey, structureDef);
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
      resourceTypeOf(context.resource, 'Unknown'),
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
