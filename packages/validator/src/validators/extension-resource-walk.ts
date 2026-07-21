import type { ValidationIssue } from '../types';
import type { ExtensionValidationContext } from './extension-types';
import { validateUniversalExtensionRules } from './extension-universal-rules';

interface ExtensionResourceWalkOptions {
  maxNestedExtensionDepth: number;
  isExtensionUrlResolvable(url: string, fhirVersion: 'R4' | 'R5' | 'R6'): Promise<boolean>;
}

export async function walkResourceExtensions(
  value: any,
  basePath: string,
  context: ExtensionValidationContext,
  knownUrls: Set<string>,
  visited: Set<string>,
  issues: ValidationIssue[],
  options: ExtensionResourceWalkOptions,
  depth = 0
): Promise<void> {
  if (value == null || typeof value !== 'object') return;
  if (depth > 20) return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      await walkResourceExtensions(
        value[i],
        `${basePath}[${i}]`,
        context,
        knownUrls,
        visited,
        issues,
        options,
        depth + 1,
      );
    }
    return;
  }

  for (const key of Object.keys(value)) {
    if (key === 'resourceType') continue;

    const child = value[key];
    const isExtensionArray = (key === 'extension' || key === 'modifierExtension') && Array.isArray(child);

    if (isExtensionArray) {
      for (let i = 0; i < child.length; i++) {
        const ext = child[i];
        const extPath = `${basePath}.${key}[${i}]`;
        visited.add(extPath);

        issues.push(...await validateUniversalExtensionRules({
          extension: ext,
          extensionType: key === 'modifierExtension' ? 'modifierExtension' : 'extension',
          path: extPath,
          knownUrls,
          context,
          visited,
          depth: depth + 1,
          maxNestedExtensionDepth: options.maxNestedExtensionDepth,
          isExtensionUrlResolvable: options.isExtensionUrlResolvable,
        }));
      }
      continue;
    }

    await walkResourceExtensions(
      child,
      `${basePath}.${key}`,
      context,
      knownUrls,
      visited,
      issues,
      options,
      depth + 1,
    );
  }
}
