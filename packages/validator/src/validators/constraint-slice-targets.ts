import type { ElementDefinition } from '../core/structure-definition-types';
import type { ValidationTarget } from '../business-rules/element-validation-targets';
import { getEvaluationContext } from './constraint-path-utils';
import {
  extractFixedEntry,
  extractPatternEntry,
  getValueAtPath,
  inferType,
  matchesPattern,
  valueCanIdentifyFixedSlice,
} from './slice-utils';

interface SliceMatchContext {
  resource: unknown;
  target: Pick<ValidationTarget, 'fullPath'>;
}

export function targetMatchesSliceDefinition(
  value: unknown,
  element: ElementDefinition,
  elements: ElementDefinition[],
  context?: SliceMatchContext,
): boolean {
  const sliceAncestors = getSliceAncestors(element, elements);
  if (sliceAncestors.length === 0) {
    return true;
  }

  for (const slice of sliceAncestors) {
    const sliceValue = slice === element
      ? value
      : getSliceAncestorValue(slice, element, context);

    if (sliceValue === undefined || !matchesSliceElement(sliceValue, slice, elements)) {
      return false;
    }
  }

  return true;
}

function matchesSliceElement(
  value: unknown,
  element: ElementDefinition,
  elements: ElementDefinition[],
): boolean {
  const inlinePattern = extractPatternEntry(element);
  if (inlinePattern && !matchesPattern(value, inlinePattern.value)) return false;
  const inlineFixed = extractFixedEntry(element);
  if (
    inlineFixed &&
    !valueCanIdentifyFixedSlice(value, inlineFixed.value, inlineFixed.key)
  ) return false;
  if (inlinePattern || inlineFixed) return true;

  const childPatternEntries = getSliceChildPatternEntries(element, elements);
  if (childPatternEntries.length === 0) {
    return matchesChoiceTypeSlice(value, element);
  }

  return childPatternEntries.every(({ relativePath, kind, key, expected }) => {
    const actual = getValueAtPath(value, relativePath);
    return kind === 'pattern'
      ? matchesPattern(actual, expected)
      : valueCanIdentifyFixedSlice(actual, expected, key);
  });
}

function matchesChoiceTypeSlice(
  value: unknown,
  element: ElementDefinition,
): boolean {
  if (!element.path.endsWith('[x]') || !Array.isArray(element.type)) return false;
  const actualType = inferType(value);
  return element.type.some(type =>
    isRecord(type) && type.code === actualType
  );
}

function getSliceAncestors(
  element: ElementDefinition,
  elements: ElementDefinition[],
): ElementDefinition[] {
  const elementId = element.id;
  if (!elementId) {
    return element.sliceName ? [element] : [];
  }

  return elements
    .filter(candidate =>
      isElementDefinition(candidate) &&
      Boolean(candidate.sliceName) &&
      typeof candidate.id === 'string' &&
      (elementId === candidate.id || elementId.startsWith(`${candidate.id}.`))
    )
    .sort((a, b) => (a.id?.length ?? 0) - (b.id?.length ?? 0));
}

function getSliceAncestorValue(
  slice: ElementDefinition,
  element: ElementDefinition,
  context: SliceMatchContext | undefined,
): unknown {
  if (!context || !slice.path || !element.path) return undefined;
  if (!pathStartsWith(element.path, slice.path)) return undefined;

  const concretePath = concretePathForAncestor(context.target.fullPath, slice.path);
  return concretePath ? getEvaluationContext(context.resource, concretePath) : undefined;
}

function concretePathForAncestor(targetFullPath: string, ancestorPath: string): string | null {
  const targetSegments = targetFullPath.split('.');
  const ancestorSegments = ancestorPath.split('.');
  if (targetSegments.length < ancestorSegments.length) return null;
  return targetSegments.slice(0, ancestorSegments.length).join('.');
}

function pathStartsWith(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}

function getSliceChildPatternEntries(
  element: ElementDefinition,
  elements: ElementDefinition[],
): Array<{
  relativePath: string;
  kind: 'fixed' | 'pattern';
  key: string;
  expected: unknown;
}> {
  if (!element.id) return [];
  const prefix = `${element.id}.`;

  return elements.flatMap(candidate => {
    if (!isElementDefinition(candidate)) return [];
    if (!candidate.id?.startsWith(prefix)) return [];
    const pattern = extractPatternEntry(candidate);
    const fixed = extractFixedEntry(candidate);
    const constraint = pattern
      ? { kind: 'pattern' as const, ...pattern }
      : fixed
        ? { kind: 'fixed' as const, ...fixed }
        : undefined;
    if (!constraint) return [];
    const relativePath = candidate.id.substring(prefix.length);
    if (relativePath.includes(':')) return [];
    return [{
      relativePath,
      kind: constraint.kind,
      key: constraint.key,
      expected: constraint.value,
    }];
  });
}

function isElementDefinition(value: unknown): value is ElementDefinition {
  return isRecord(value) && typeof value.path === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
