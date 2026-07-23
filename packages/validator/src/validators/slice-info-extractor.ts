/**
 * Slice Info Extractor
 *
 * Extracted from SlicingValidator. Builds SliceDefinition[] from a
 * StructureDefinition by scanning for slicing declarations and
 * collecting child patterns, fixed values, type constraints, and
 * binding codes.
 */

import type { StructureDefinition, ElementDefinition, SlicingDefinition } from '../core/structure-definition-types';
import type { SliceDefinition } from './slice-types';
import {
  extractFixedEntry,
  extractFixedFromElement,
  extractPatternEntry,
  extractPatternFromElement,
} from './slice-utils';
import { inferChoiceSliceType } from './slice-choice-type-inference';
import { logger } from '../logger';

export type TypeProfileResolverFn = ((url: string) => Promise<StructureDefinition | null>) | null;

export interface ValueSetLoaderLike {
  loadValueSet(url: string): Promise<string[] | null>;
}

type TypeSpec = { code: string; profile?: string[]; targetProfile?: string[] };

async function mergeTypeProfilePatterns(
  element: ElementDefinition,
  childPatterns: Map<string, any>,
  childFixed: Map<string, any>,
  childMin: Map<string, number>,
  resolver: TypeProfileResolverFn,
): Promise<void> {
  if (!resolver || !element.type) return;

  for (const typeSpec of element.type) {
    if (!typeSpec.profile || typeSpec.profile.length === 0) continue;
    for (const profileUrl of typeSpec.profile) {
      try {
        const typeSd = await resolver(profileUrl);
        if (!typeSd) continue;
        const typeElements = typeSd.snapshot?.element || typeSd.differential?.element || [];
        const typeRoot = typeSd.type || '';
        for (const typeEl of typeElements) {
          if (!typeEl.path.startsWith(typeRoot + '.')) continue;
          const relativePath = getTypeProfileRelativePath(typeEl, typeRoot);
          if (!childPatterns.has(relativePath)) {
            const tp = extractPatternFromElement(typeEl);
            if (tp !== undefined) childPatterns.set(relativePath, tp);
          }
          if (!childFixed.has(relativePath)) {
            const tf = extractFixedFromElement(typeEl);
            if (tf !== undefined) childFixed.set(relativePath, tf);
          }
          if ((typeEl.min ?? 0) > 0 && !childMin.has(relativePath)) {
            childMin.set(relativePath, typeEl.min!);
          }
        }
      } catch (err) {
        logger.debug(`[SlicingValidator] Failed to resolve type profile ${profileUrl}: ${err}`);
      }
    }
  }
}

async function mergeAncestorTypeProfileSliceMetadata({
  element,
  elements,
  elementPath,
  sliceDef,
  childPatterns,
  childFixed,
  childMin,
  childTypes,
  resolver,
}: {
  element: ElementDefinition;
  elements: ElementDefinition[];
  elementPath: string;
  sliceDef: SliceDefinition;
  childPatterns: Map<string, any>;
  childFixed: Map<string, any>;
  childMin: Map<string, number>;
  childTypes: Map<string, TypeSpec[]>;
  resolver: TypeProfileResolverFn;
}): Promise<void> {
  if (!resolver || !element.id || !element.sliceName) return;

  for (const ancestor of findTypedAncestorElements(elements, element.id, elementPath)) {
    const relativePath = getRelativeProfilePath(ancestor.path, elementPath);
    if (!relativePath) continue;

    for (const typeSpec of ancestor.type ?? []) {
      for (const profileUrl of typeSpec.profile ?? []) {
        try {
          const typeSd = await resolver(profileUrl);
          const typeElements = typeSd?.snapshot?.element || typeSd?.differential?.element || [];
          const typeRoot = typeSd?.type || '';
          if (!typeRoot) continue;

          const inheritedElement = typeElements.find(candidate =>
            candidate.path === `${typeRoot}.${relativePath}` &&
            candidate.sliceName === element.sliceName
          );
          if (!inheritedElement) continue;

          mergeInheritedSliceElement(sliceDef, inheritedElement);
          mergeInheritedSliceChildren(
            inheritedElement,
            typeElements,
            childPatterns,
            childFixed,
            childMin,
            childTypes,
          );
        } catch (err) {
          logger.debug(`[SlicingValidator] Failed to inherit slice metadata from type profile ${profileUrl}: ${err}`);
        }
      }
    }
  }
}

function findTypedAncestorElements(
  elements: ElementDefinition[],
  elementId: string,
  elementPath: string,
): ElementDefinition[] {
  return elements
    .filter(candidate =>
      typeof candidate.id === 'string' &&
      candidate.id.length < elementId.length &&
      elementId.startsWith(`${candidate.id}.`) &&
      typeof candidate.path === 'string' &&
      elementPath.startsWith(`${candidate.path}.`) &&
      (candidate.type ?? []).some(typeSpec => (typeSpec.profile ?? []).length > 0)
    )
    .sort((left, right) => right.id!.length - left.id!.length);
}

function getRelativeProfilePath(ancestorPath: string | undefined, elementPath: string): string | null {
  if (!ancestorPath || !elementPath.startsWith(`${ancestorPath}.`)) return null;
  return elementPath.slice(ancestorPath.length + 1);
}

function mergeInheritedSliceElement(
  sliceDef: SliceDefinition,
  inheritedElement: ElementDefinition,
): void {
  if (!sliceDef.type && inheritedElement.type) {
    sliceDef.type = inheritedElement.type;
  }

  if (sliceDef.pattern === undefined) {
    const inheritedPattern = extractPatternEntry(inheritedElement);
    if (inheritedPattern !== undefined) {
      sliceDef.pattern = inheritedPattern.value;
      sliceDef.patternKind = inheritedPattern.key;
    }
  }

  if (sliceDef.fixed === undefined) {
    const inheritedFixed = extractFixedEntry(inheritedElement);
    if (inheritedFixed !== undefined) {
      sliceDef.fixed = inheritedFixed.value;
      sliceDef.fixedKind = inheritedFixed.key;
    }
  }
}

function mergeInheritedSliceChildren(
  inheritedElement: ElementDefinition,
  typeElements: ElementDefinition[],
  childPatterns: Map<string, any>,
  childFixed: Map<string, any>,
  childMin: Map<string, number>,
  childTypes: Map<string, TypeSpec[]>,
): void {
  const inheritedPrefix = inheritedElement.id ? `${inheritedElement.id}.` : null;
  if (!inheritedPrefix) return;

  for (const candidate of typeElements) {
    if (typeof candidate.id !== 'string' || !candidate.id.startsWith(inheritedPrefix)) continue;
    const relativePath = candidate.id.slice(inheritedPrefix.length);
    if (!childPatterns.has(relativePath)) {
      const childPattern = extractPatternFromElement(candidate);
      if (childPattern !== undefined) childPatterns.set(relativePath, childPattern);
    }
    if (!childFixed.has(relativePath)) {
      const childFixedValue = extractFixedFromElement(candidate);
      if (childFixedValue !== undefined) childFixed.set(relativePath, childFixedValue);
    }
    if ((candidate.min ?? 0) > 0 && !childMin.has(relativePath)) {
      childMin.set(relativePath, candidate.min!);
    }
    if (!childTypes.has(relativePath) && candidate.type && candidate.type.length > 0) {
      childTypes.set(relativePath, candidate.type);
    }
  }
}

function getTypeProfileRelativePath(element: ElementDefinition, typeRoot: string): string {
  const idPrefix = `${typeRoot}.`;
  if (typeof element.id === 'string' && element.id.startsWith(idPrefix)) {
    return element.id.substring(idPrefix.length);
  }
  return element.path.substring(typeRoot.length + 1);
}

function applyRootSliceConstraints(sliceDef: SliceDefinition, element: ElementDefinition): void {
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

export async function extractSlicingInfo(
  elementPath: string,
  profileSD: StructureDefinition,
  typeProfileResolver: TypeProfileResolverFn,
  valueSetLoader: ValueSetLoaderLike | null,
  slicingElementId?: string,
): Promise<{ slicing: SlicingDefinition; slices: SliceDefinition[] } | null> {
  const elements = profileSD.snapshot?.element || profileSD.differential?.element || [];

  const baseElement = slicingElementId
    ? elements.find(e => e.id === slicingElementId && e.path === elementPath && e.slicing)
    : elements.find(e => e.path === elementPath && e.slicing);
  const candidateSliceElements = elements.filter(element =>
    element.path === elementPath &&
    Boolean(element.sliceName) &&
    (!slicingElementId || !element.id || element.id.startsWith(`${slicingElementId}:`))
  );
  if ((!baseElement || !baseElement.slicing) && candidateSliceElements.length === 0) return null;

  const slicingDef: SlicingDefinition = baseElement?.slicing ?? inferInheritedSlicing(candidateSliceElements);
  const childBindingDiscriminatorPaths = collectChildBindingDiscriminatorPaths(slicingDef);
  const slices: SliceDefinition[] = [];
  const nestedSlicePrefix = baseElement?.id ? `${baseElement.id}:` : null;

  for (const element of elements) {
    if (element.path !== elementPath || !element.sliceName) continue;
    if (nestedSlicePrefix && !element.id?.startsWith(nestedSlicePrefix)) continue;

    const sliceDef: SliceDefinition = {
      sliceName: element.sliceName,
      path: element.path,
      min: element.min !== undefined ? element.min : 0,
      max: element.max || '*',
      discriminator: slicingDef.discriminator,
      type: element.type,
    };

    applyRootSliceConstraints(sliceDef, element);

    const slicePrefix = element.id
      ? `${element.id}.`
      : `${elementPath}:${element.sliceName}.`;
    const childPatterns = new Map<string, any>();
    const childFixed = new Map<string, any>();
    const childMin = new Map<string, number>();
    const childTypes = new Map<string, Array<{ code: string; profile?: string[]; targetProfile?: string[] }>>();
    const childBindingValueSets = new Map<string, string>();
    const childBindingCodes = new Map<string, Set<string>>();

    for (const candidate of elements) {
      if (typeof candidate.id !== 'string') continue;
      if (!candidate.id.startsWith(slicePrefix)) continue;

      const relativePath = candidate.id.substring(slicePrefix.length);
      const childPattern = extractPatternFromElement(candidate);
      if (childPattern !== undefined) childPatterns.set(relativePath, childPattern);
      const childFixedValue = extractFixedFromElement(candidate);
      if (childFixedValue !== undefined) childFixed.set(relativePath, childFixedValue);
      if ((candidate.min ?? 0) > 0) {
        childMin.set(relativePath, candidate.min!);
      }
      if (candidate.type && candidate.type.length > 0) {
        childTypes.set(relativePath, candidate.type);
      }
      const bindingValueSet = candidate.binding?.valueSet;
      if (
        bindingValueSet &&
        valueSetLoader &&
        childBindingAppliesToDiscriminatorPath(relativePath, childBindingDiscriminatorPaths)
      ) {
        childBindingValueSets.set(relativePath, bindingValueSet);
        try {
          const codes = await valueSetLoader.loadValueSet(bindingValueSet);
          if (codes && codes.length > 0) {
            childBindingCodes.set(relativePath, new Set(codes));
            logger.debug(`[SlicingValidator] Loaded ${codes.length} child binding codes for slice ${element.sliceName}.${relativePath}`);
          }
        } catch {
          logger.debug(`[SlicingValidator] Failed to load child binding ValueSet for slice ${element.sliceName}.${relativePath}: ${bindingValueSet}`);
        }
      }
    }

    await mergeTypeProfilePatterns(element, childPatterns, childFixed, childMin, typeProfileResolver);
    await mergeAncestorTypeProfileSliceMetadata({
      element,
      elements,
      elementPath,
      sliceDef,
      childPatterns,
      childFixed,
      childMin,
      childTypes,
      resolver: typeProfileResolver,
    });
    inferChoiceSliceType(sliceDef, elementPath);

    if (childPatterns.size > 0) sliceDef.childPatterns = childPatterns;
    if (childFixed.size > 0) sliceDef.childFixed = childFixed;
    if (childMin.size > 0) sliceDef.childMin = childMin;
    if (childTypes.size > 0) sliceDef.childTypes = childTypes;
    if (childBindingValueSets.size > 0) sliceDef.childBindingValueSets = childBindingValueSets;
    if (childBindingCodes.size > 0) sliceDef.childBindingCodes = childBindingCodes;

    if (!sliceDef.pattern && !sliceDef.fixed) {
      const binding = element.binding;
      if (binding?.valueSet && valueSetLoader) {
        sliceDef.bindingValueSet = binding.valueSet;
        try {
          const codes = await valueSetLoader.loadValueSet(binding.valueSet);
          if (codes && codes.length > 0) {
            sliceDef.bindingCodes = new Set(codes);
            logger.debug(`[SlicingValidator] Loaded ${codes.length} binding codes for slice ${element.sliceName}`);
          }
        } catch {
          logger.debug(`[SlicingValidator] Failed to load binding ValueSet for slice ${element.sliceName}`);
        }
      }
    }

    slices.push(sliceDef);
  }

  logger.debug(`[SlicingValidator] Found ${slices.length} slices for ${elementPath}`);
  return { slicing: slicingDef, slices };
}

function collectChildBindingDiscriminatorPaths(slicingDef: SlicingDefinition): Set<string> {
  const paths = new Set<string>();
  for (const discriminator of slicingDef.discriminator ?? []) {
    const path = normalizeChildBindingDiscriminatorPath(discriminator.path);
    if (path) paths.add(path);
  }
  return paths;
}

function normalizeChildBindingDiscriminatorPath(path?: string): string | null {
  if (!path || path === '$this') return null;
  if (path.startsWith('$this.')) return path.slice('$this.'.length);
  if (path.startsWith('resolve()')) return null;
  return path;
}

function childBindingAppliesToDiscriminatorPath(relativePath: string, discriminatorPaths: Set<string>): boolean {
  for (const discriminatorPath of discriminatorPaths) {
    if (discriminatorPath === relativePath || discriminatorPath.startsWith(`${relativePath}.`)) {
      return true;
    }
  }
  return false;
}

function inferInheritedSlicing(sliceElements: ElementDefinition[]): SlicingDefinition {
  const hasFixedSlice = sliceElements.some(element => extractFixedEntry(element) !== undefined);
  return {
    discriminator: [{
      type: hasFixedSlice ? 'value' : 'pattern',
      path: '$this',
    }],
    rules: 'open',
    ordered: false,
    description: 'Inferred from differential slice elements whose slicing declaration is inherited from a base profile.',
  };
}
