import type { ElementDefinition } from '../core/structure-definition-types';
import type { ValidationTarget } from '../business-rules/element-validation-targets';
import { getEvaluationContext } from './constraint-path-utils';

interface SliceMatchContext {
  resource: any;
  target: Pick<ValidationTarget, 'fullPath'>;
}

export function targetMatchesSliceDefinition(
  value: any,
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
  value: any,
  element: ElementDefinition,
  elements: ElementDefinition[],
): boolean {
  const patternEntries = Object.entries(element)
    .filter(([key]) => key.startsWith('pattern') || key.startsWith('fixed'));

  if (patternEntries.length > 0) {
    return patternEntries.every(([, expected]) => matchesPattern(value, expected));
  }

  const childPatternEntries = getSliceChildPatternEntries(element, elements);
  if (childPatternEntries.length === 0) {
    return true;
  }

  return childPatternEntries.every(({ relativePath, expected }) =>
    matchesPattern(getValueAtRelativePath(value, relativePath), expected)
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
): any {
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

function matchesPattern(actual: any, expected: any): boolean {
  if (expected === undefined) return true;
  if (Array.isArray(actual) && !Array.isArray(expected)) {
    return actual.some(item => matchesPattern(item, expected));
  }
  if (expected === null || typeof expected !== 'object') {
    return actual === expected;
  }
  if (!actual || typeof actual !== 'object') {
    return false;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem, index) => matchesPattern(actual[index], expectedItem));
  }
  return Object.entries(expected).every(([key, value]) =>
    matchesPattern(actual[key], value)
  );
}

function getSliceChildPatternEntries(
  element: ElementDefinition,
  elements: ElementDefinition[],
): Array<{ relativePath: string; expected: any }> {
  if (!element.id) return [];
  const prefix = `${element.id}.`;

  return elements.flatMap(candidate => {
    if (!candidate.id?.startsWith(prefix)) return [];
    const expected = getPatternOrFixedValue(candidate);
    if (expected === undefined) return [];
    const relativePath = candidate.id.substring(prefix.length);
    if (relativePath.includes(':')) return [];
    return [{ relativePath, expected }];
  });
}

function getPatternOrFixedValue(element: ElementDefinition): any {
  const candidate = element as ElementDefinition & Record<string, unknown>;
  if (candidate.pattern !== undefined) return candidate.pattern;
  if (candidate.fixed !== undefined) return candidate.fixed;
  for (const key of Object.keys(candidate)) {
    if ((key.startsWith('pattern') || key.startsWith('fixed')) && key !== 'pattern' && key !== 'fixed') {
      return candidate[key];
    }
  }
  return undefined;
}

function getValueAtRelativePath(value: any, relativePath: string): any {
  if (!relativePath || relativePath === '$this') return value;

  let current = value;
  for (const segment of relativePath.split('.')) {
    if (Array.isArray(current)) {
      current = current
        .map(item => item?.[segment])
        .filter(item => item !== undefined && item !== null);
      continue;
    }

    if (!current || typeof current !== 'object') return undefined;
    current = current[segment];
  }

  return current;
}
