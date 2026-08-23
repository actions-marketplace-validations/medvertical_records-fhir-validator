import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { isRecord, resourceTypeOf } from '../core/fhir-resource';
import type { ExtensionUsageSite, NormalizedExtensionContext } from './extension-context-matching';
import { validateExtensionContextUsage } from './extension-context-usage';
import {
  isAbsoluteExtensionUrl,
  shouldReportUnresolvableExtensionUrl,
  validateExtensionStructure,
  validateKnownHl7ExtensionValueType,
} from './extension-structure-rules';
import type { ExtensionValidationContext } from './extension-types';
import { isKnownCrossVersionExtensionUrl } from './extension-xver-urls';

interface ValidateUniversalExtensionRulesParams {
  extension: unknown;
  extensionType: 'extension' | 'modifierExtension';
  path: string;
  knownUrls: Set<string>;
  context: ExtensionValidationContext;
  visited: Set<string>;
  depth: number;
  maxNestedExtensionDepth: number;
  isNested?: boolean;
  isExtensionUrlResolvable: (
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ) => Promise<boolean>;
  getDeclaredContexts: (
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ) => Promise<NormalizedExtensionContext[] | null>;
  site: ExtensionUsageSite;
}

export async function validateUniversalExtensionRules({
  extension,
  extensionType,
  path,
  knownUrls,
  context,
  visited,
  depth,
  maxNestedExtensionDepth,
  isNested = false,
  isExtensionUrlResolvable,
  getDeclaredContexts,
  site,
}: ValidateUniversalExtensionRulesParams): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(extension)) return issues;

  const url = typeof extension.url === 'string' ? extension.url : undefined;
  issues.push(...await validateExtensionUrlRules({
    url,
    extensionType,
    path,
    knownUrls,
    context,
    isNested,
    isExtensionUrlResolvable,
  }));

  if (url) {
    issues.push(...validateExtensionStructure(
      extension,
      extensionType,
      path,
      resourceTypeOf(context.resource, 'Unknown'),
    ));
    issues.push(...await validateExtensionContextUsage({
      url,
      path,
      site,
      resourceType: resourceTypeOf(context.resource, 'Unknown'),
      fhirVersion: context.fhirVersion,
      getDeclaredContexts,
    }));
  }

  issues.push(...validateKnownHl7ExtensionValueType(
    extension,
    path,
    resourceTypeOf(context.resource, 'Unknown'),
  ));

  if (Array.isArray(extension.extension) && depth < maxNestedExtensionDepth) {
    const nestedSite: ExtensionUsageSite = {
      resourceType: site.resourceType,
      elementPath: `${site.elementPath}.extension`,
      attachment: 'nested-extension',
      parentExtensionUrl: url,
    };
    for (let i = 0; i < extension.extension.length; i++) {
      const nested = extension.extension[i];
      const nestedPath = `${path}.extension[${i}]`;
      visited.add(nestedPath);
      const nestedIssues = await validateUniversalExtensionRules({
        extension: nested,
        extensionType: 'extension',
        path: nestedPath,
        knownUrls,
        context,
        visited,
        depth: depth + 1,
        maxNestedExtensionDepth,
        isNested: true,
        isExtensionUrlResolvable,
        getDeclaredContexts,
        site: nestedSite,
      });
      issues.push(...nestedIssues);
    }
  }

  return issues;
}

async function validateExtensionUrlRules({
  url,
  extensionType,
  path,
  knownUrls,
  context,
  isNested,
  isExtensionUrlResolvable,
}: Pick<ValidateUniversalExtensionRulesParams,
  'extensionType' | 'path' | 'knownUrls' | 'context' | 'isExtensionUrlResolvable'
> & {
  url: string | undefined;
  isNested: boolean;
}): Promise<ValidationIssue[]> {
  const resourceType = resourceTypeOf(context.resource, 'Unknown');
  const issues: ValidationIssue[] = [];

  if (!url || url === '') {
    issues.push(createValidationIssue({
      code: 'profile-extension-url-missing',
      path,
      resourceType,
      messageParams: { extensionType },
    }));
  } else if (!isNested && !isAbsoluteExtensionUrl(url)) {
    issues.push(createValidationIssue({
      code: 'profile-extension-url-not-absolute',
      path,
      resourceType,
      messageParams: { url, extensionType },
    }));
  } else if (!isNested && url.includes('|')) {
    issues.push(...createVersionedUrlIssues(url, path, resourceType));
  } else if (!isNested && !knownUrls.has(url) && shouldReportUnresolvableExtensionUrl(url)) {
    const resolvable = await isExtensionUrlResolvable(url, context.fhirVersion)
      || isKnownCrossVersionExtensionUrl(url, extensionType);
    if (!resolvable) {
      issues.push(createUnresolvedExtensionIssue(url, extensionType, path, resourceType));
    }
  }

  return issues;
}

/**
 * Canonical registry domains whose extension URLs are expected to resolve:
 * the HL7 reference validator errors on an unresolvable hl7.org / fhir.org
 * extension (see the fhir-test-cases bundle-ea-testcase Java baseline), so
 * these cannot drop below warning without losing conformance parity.
 */
const REGISTRY_EXTENSION_URL = /^https?:\/\/([^/]+\.)?(hl7\.org|fhir\.org)\//i;

/**
 * FHIR's open-world model allows unknown plain extensions from private
 * canonical spaces, so those only get a hint — but registry-domain URLs are
 * expected to resolve (warning), and an unrecognised modifierExtension
 * cannot be safely ignored and must fail validation.
 */
function createUnresolvedExtensionIssue(
  url: string,
  extensionType: 'extension' | 'modifierExtension',
  path: string,
  resourceType: string,
): ValidationIssue {
  const isModifier = extensionType === 'modifierExtension';
  const plainSeverity = REGISTRY_EXTENSION_URL.test(url) ? 'warning' : 'information';
  return createValidationIssue({
    code: 'profile-extension-not-found',
    path,
    resourceType,
    messageParams: { url },
    severityOverride: isModifier ? 'error' : plainSeverity,
    ...(isModifier && {
      customMessage: `The modifier extension ${url} could not be resolved; unrecognised modifier extensions cannot be safely ignored — verify its StructureDefinition or package availability`,
    }),
  });
}

function createVersionedUrlIssues(
  url: string,
  path: string,
  resourceType: string,
): ValidationIssue[] {
  return [
    createValidationIssue({
      code: 'profile-extension-url-versioned',
      path,
      resourceType,
      customMessage: `The extension URL must not contain a version. The versioned URL '${url}' is not a valid extension identifier — strip the '|<version>' suffix.`,
      severityOverride: 'error',
      details: { url },
    }),
    createValidationIssue({
      code: 'profile-extension-url-fixed-mismatch',
      path: `${path}.url`,
      resourceType,
      customMessage: `Extension.url value '${url}' must be the unversioned canonical URL (the version pipe '|<version>' is not permitted here).`,
      severityOverride: 'error',
      details: { url },
    }),
  ];
}
