import type { ElementDefinition, StructureDefinition } from '../core/structure-definition-types';
import { logger } from '../logger';
import type { SliceDefinition } from './slice-types';
import {
  extractFixedEntry,
  extractFixedFromElement,
  extractPatternEntry,
  extractPatternFromElement,
} from './slice-utils';
import {
  getElementTypes,
  getNonEmptyString,
  getProfileElements,
  type TypeSpec,
} from './slice-info-input';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';

export type TypeProfileResolverFn = ((url: string) => Promise<StructureDefinition | null>) | null;

export async function mergeTypeProfilePatterns(
  element: ElementDefinition,
  childPatterns: Map<string, unknown>,
  childFixed: Map<string, unknown>,
  childMin: Map<string, number>,
  resolver: TypeProfileResolverFn,
): Promise<void> {
  if (!resolver) return;
  for (const typeSpec of getElementTypes(element)) {
    for (const profileUrl of typeSpec.profile ?? []) {
      try {
        const typeDefinition = await resolver(profileUrl);
        if (!typeDefinition) continue;
        const typeRoot = getNonEmptyString(typeDefinition.type) ?? '';
        for (const typeElement of getProfileElements(typeDefinition)) {
          if (!typeElement.path.startsWith(`${typeRoot}.`)) continue;
          mergeTypeProfileChild(typeElement, typeRoot, childPatterns, childFixed, childMin);
        }
      } catch (error) {
        logger.debug('[SlicingValidator] Failed to resolve type profile', {
          ...profileCanonicalMetadata(profileUrl),
          ...validationFailureMetadata(error),
        });
      }
    }
  }
}

export async function mergeAncestorTypeProfileSliceMetadata(input: {
  element: ElementDefinition;
  elements: ElementDefinition[];
  elementPath: string;
  sliceDef: SliceDefinition;
  childPatterns: Map<string, unknown>;
  childFixed: Map<string, unknown>;
  childMin: Map<string, number>;
  childTypes: Map<string, TypeSpec[]>;
  resolver: TypeProfileResolverFn;
}): Promise<void> {
  const { element, elements, elementPath, resolver } = input;
  if (!resolver || !element.id || !element.sliceName) return;
  for (const ancestor of findTypedAncestorElements(elements, element.id, elementPath)) {
    const relativePath = getRelativeProfilePath(ancestor.path, elementPath);
    if (!relativePath) continue;
    for (const typeSpec of getElementTypes(ancestor)) {
      for (const profileUrl of typeSpec.profile ?? []) {
        await mergeAncestorProfile(profileUrl, relativePath, input);
      }
    }
  }
}

export function applyRootSliceConstraints(sliceDef: SliceDefinition, element: ElementDefinition): void {
  const rootPattern = extractPatternEntry(element);
  if (rootPattern !== undefined) {
    sliceDef.pattern = rootPattern.value;
    sliceDef.patternKind = rootPattern.key;
  }
  const rootFixed = extractFixedEntry(element);
  if (rootFixed !== undefined) {
    sliceDef.fixed = rootFixed.value;
    sliceDef.fixedKind = rootFixed.key;
  }
}

function mergeTypeProfileChild(
  element: ElementDefinition,
  typeRoot: string,
  childPatterns: Map<string, unknown>,
  childFixed: Map<string, unknown>,
  childMin: Map<string, number>,
): void {
  const relativePath = getTypeProfileRelativePath(element, typeRoot);
  if (!childPatterns.has(relativePath)) {
    const pattern = extractPatternFromElement(element);
    if (pattern !== undefined) childPatterns.set(relativePath, pattern);
  }
  if (!childFixed.has(relativePath)) {
    const fixed = extractFixedFromElement(element);
    if (fixed !== undefined) childFixed.set(relativePath, fixed);
  }
  if ((element.min ?? 0) > 0 && !childMin.has(relativePath)) childMin.set(relativePath, element.min!);
}

async function mergeAncestorProfile(
  profileUrl: string,
  relativePath: string,
  input: Parameters<typeof mergeAncestorTypeProfileSliceMetadata>[0],
): Promise<void> {
  try {
    const typeDefinition = await input.resolver?.(profileUrl);
    const typeElements = getProfileElements(typeDefinition);
    const typeRoot = getNonEmptyString(typeDefinition?.type) ?? '';
    if (!typeRoot) return;
    const inheritedElement = typeElements.find(candidate =>
      candidate.path === `${typeRoot}.${relativePath}`
      && candidate.sliceName === input.element.sliceName
    );
    if (!inheritedElement) return;
    mergeInheritedSliceElement(input.sliceDef, inheritedElement);
    mergeInheritedSliceChildren(inheritedElement, typeElements, input);
  } catch (error) {
    logger.debug('[SlicingValidator] Failed to inherit slice metadata from type profile', {
      ...profileCanonicalMetadata(profileUrl),
      ...validationFailureMetadata(error),
    });
  }
}

function findTypedAncestorElements(
  elements: ElementDefinition[],
  elementId: string,
  elementPath: string,
): ElementDefinition[] {
  return elements.filter(candidate =>
    typeof candidate.id === 'string'
    && candidate.id.length < elementId.length
    && elementId.startsWith(`${candidate.id}.`)
    && typeof candidate.path === 'string'
    && elementPath.startsWith(`${candidate.path}.`)
    && getElementTypes(candidate).some(typeSpec => (typeSpec.profile ?? []).length > 0)
  ).sort((left, right) => right.id!.length - left.id!.length);
}

function getRelativeProfilePath(ancestorPath: string | undefined, elementPath: string): string | null {
  return ancestorPath && elementPath.startsWith(`${ancestorPath}.`)
    ? elementPath.slice(ancestorPath.length + 1)
    : null;
}

function mergeInheritedSliceElement(sliceDef: SliceDefinition, inherited: ElementDefinition): void {
  if (!sliceDef.type && inherited.type) sliceDef.type = inherited.type;
  if (sliceDef.pattern === undefined) {
    const pattern = extractPatternEntry(inherited);
    if (pattern !== undefined) {
      sliceDef.pattern = pattern.value;
      sliceDef.patternKind = pattern.key;
    }
  }
  if (sliceDef.fixed === undefined) {
    const fixed = extractFixedEntry(inherited);
    if (fixed !== undefined) {
      sliceDef.fixed = fixed.value;
      sliceDef.fixedKind = fixed.key;
    }
  }
}

function mergeInheritedSliceChildren(
  inherited: ElementDefinition,
  typeElements: ElementDefinition[],
  input: Parameters<typeof mergeAncestorTypeProfileSliceMetadata>[0],
): void {
  const prefix = inherited.id ? `${inherited.id}.` : null;
  if (!prefix) return;
  for (const candidate of typeElements) {
    if (typeof candidate.id !== 'string' || !candidate.id.startsWith(prefix)) continue;
    const relativePath = candidate.id.slice(prefix.length);
    mergeInheritedChild(relativePath, candidate, input);
  }
}

function mergeInheritedChild(
  relativePath: string,
  candidate: ElementDefinition,
  input: Parameters<typeof mergeAncestorTypeProfileSliceMetadata>[0],
): void {
  if (!input.childPatterns.has(relativePath)) {
    const pattern = extractPatternFromElement(candidate);
    if (pattern !== undefined) input.childPatterns.set(relativePath, pattern);
  }
  if (!input.childFixed.has(relativePath)) {
    const fixed = extractFixedFromElement(candidate);
    if (fixed !== undefined) input.childFixed.set(relativePath, fixed);
  }
  if ((candidate.min ?? 0) > 0 && !input.childMin.has(relativePath)) {
    input.childMin.set(relativePath, candidate.min!);
  }
  const types = getElementTypes(candidate);
  if (!input.childTypes.has(relativePath) && types.length > 0) input.childTypes.set(relativePath, types);
}

function getTypeProfileRelativePath(element: ElementDefinition, typeRoot: string): string {
  const idPrefix = `${typeRoot}.`;
  return typeof element.id === 'string' && element.id.startsWith(idPrefix)
    ? element.id.substring(idPrefix.length)
    : element.path.substring(typeRoot.length + 1);
}
