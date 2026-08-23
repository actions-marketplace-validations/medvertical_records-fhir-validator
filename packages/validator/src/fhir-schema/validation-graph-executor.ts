import type { ValidationIssue } from '../types';
import { matchPatternWithDiagnostic } from './validation-graph-pattern-diagnostics';
import { getDirectValues, getParentValues, isChoiceProperty } from './validation-graph-path-values';
import { validateReferenceTarget } from './validation-graph-reference-targets';
import {
  isSliceMatchableByValue,
  matchesSliceForParent,
  shouldReportUnmatchableRequiredSlice,
} from './validation-graph-slice-matching';
import type { ValidationGraph, ValidationGraphNode } from './validation-graph-types';
import { graphValuesMatch } from './validation-graph-value-matching';
import { createValidationGraphIssue as createIssue, isGraphRecord as isRecord } from './validation-graph-issues';
import { patternStrictlyContains } from './validation-graph-pattern-containment';

export function validateResourceWithGraph(resource: unknown, graph: ValidationGraph): ValidationIssue[] {
  if (!isRecord(resource)) {
    return [createIssue('structural-invalid-resource', graph.type, 'Resource must be a JSON object')];
  }

  const issues: ValidationIssue[] = [];
  for (const node of graph.nodes) {
    validateNode(resource, node, graph, issues, new Set());
  }
  return issues;
}

function validateNode(
  resource: Record<string, unknown>,
  node: ValidationGraphNode,
  graph: ValidationGraph,
  issues: ValidationIssue[],
  ancestors: Set<ValidationGraphNode>,
): void {
  if (node.sliceName) {
    return;
  }

  const parentValues = getParentValues(resource, node);
  validateNodeForParents(parentValues, node, graph, issues, ancestors);
}

function validateNodeForParents(
  parentValues: unknown[],
  node: ValidationGraphNode,
  graph: ValidationGraph,
  issues: ValidationIssue[],
  ancestors: Set<ValidationGraphNode>,
): void {
  if (parentValues.length === 0) {
    return;
  }
  if (ancestors.has(node)) {
    issues.push(createIssue(
      'structural-validation-graph-cycle',
      node.path,
      `Validation graph contains a cycle at '${node.path}'`,
      graph,
    ));
    return;
  }
  ancestors.add(node);
  const values = parentValues.flatMap(parent => getDirectValues(parent, node.name));
  const required = node.required || (node.min ?? 0) > 0;

  if (node.type === 'choice' || node.choices?.length) {
    validateChoiceNode(parentValues, node, graph, issues, ancestors);
  } else if (required) {
    const min = node.min ?? 1;
    for (const parent of parentValues) {
      const count = getDirectValues(parent, node.name).length;
      if (count < min) {
        issues.push(createIssue(
          'structural-required-element-missing',
          node.path,
          count === 0
            ? `Required element '${node.path}' is missing`
            : `Element '${node.path}' occurs ${count} times, minimum is ${min}`,
          graph,
        ));
      }
    }
  }

  if (node.max !== undefined && node.max !== '*') {
    const max = Number(node.max);
    if (Number.isFinite(max)) {
      for (const parent of parentValues) {
        const count = node.type === 'choice' || node.choices?.length
          ? getChoiceEntries(parent, node).length
          : getDirectValues(parent, node.name).length;
        if (count > max) {
          issues.push(createIssue(
            'structural-cardinality-max',
            node.path,
            `Element '${node.path}' occurs ${count} times, maximum is ${max}`,
            graph,
          ));
        }
      }
    }
  }

  for (const value of values) {
    if (node.fixed !== undefined && !graphValuesMatch(value, node.fixed)) {
      issues.push(createIssue(
        'profile-fixed-value-mismatch',
        node.path,
        `Element '${node.path}' does not match fixed value`,
        graph,
      ));
    }
    if (node.pattern !== undefined) {
      const pattern = matchPatternWithDiagnostic(value, node.pattern, node.path);
      if (!pattern.matches) {
        issues.push(createIssue(
          'profile-pattern-mismatch',
          pattern.path ?? node.path,
          pattern.message ?? `Element '${node.path}' does not match pattern`,
          graph,
        ));
      }
    }

    const referenceIssue = validateReferenceTarget(value, node, graph);
    if (referenceIssue) issues.push(referenceIssue);
  }

  const children = node.children ?? [];
  const sliceChildren = children.filter(child => child.sliceName);
  if (sliceChildren.length > 0 && node.type !== 'choice' && !node.choices?.length) {
    validateSliceChildren(values, node, sliceChildren, graph, issues, ancestors);
  }

  for (const child of children) {
    if (child.sliceName) {
      continue;
    }
    validateNodeForParents(values, child, graph, issues, ancestors);
  }
  ancestors.delete(node);
}

function validateSliceChildren(
  values: unknown[],
  parentNode: ValidationGraphNode,
  sliceNodes: ValidationGraphNode[],
  graph: ValidationGraph,
  issues: ValidationIssue[],
  ancestors: Set<ValidationGraphNode>,
): void {
  const enforceableSlices = sliceNodes.filter(slice => isSliceMatchableByValue(parentNode, slice));
  const unmatchableRequiredSlices = sliceNodes.filter(slice =>
    !enforceableSlices.includes(slice) &&
    shouldReportUnmatchableRequiredSlice(parentNode, slice)
  );
  if (enforceableSlices.length === 0 && unmatchableRequiredSlices.length === 0) {
    return;
  }

  const matchCounts = new Map<ValidationGraphNode, number>();
  const allowedSlices = enforceableSlices.filter(slice => slice.max !== 0);
  for (const slice of enforceableSlices) {
    const matchedValues = values.filter(value =>
      matchesSliceForParent(value, parentNode, slice) &&
      !isShadowedForbiddenSliceMatch(value, parentNode, slice, allowedSlices)
    );
    matchCounts.set(slice, matchedValues.length);
    for (const child of slice.children ?? []) {
      if (child.sliceName) {
        continue;
      }
      validateNodeForParents(matchedValues, child, graph, issues, ancestors);
    }
  }

  for (const slice of [...enforceableSlices, ...unmatchableRequiredSlices]) {
    const count = matchCounts.get(slice) ?? 0;
    const min = slice.min ?? 0;
    if (min > 0 && count < min) {
      issues.push(createIssue(
        'profile-slice-min-cardinality',
        parentNode.path,
        `Slice '${slice.path}' has ${count} matches, minimum is ${min}`,
        graph,
      ));
    }

    if (slice.max !== undefined && slice.max !== '*') {
      const max = Number(slice.max);
      if (Number.isFinite(max) && count > max) {
        issues.push(createIssue(
          'profile-slice-max-cardinality',
          parentNode.path,
          `Slice '${slice.path}' has ${count} matches, maximum is ${max}`,
          graph,
        ));
      }
    }
  }

  if (parentNode.slicing?.rules !== 'closed') {
    return;
  }

  for (const value of values) {
    const hasAllowedMatch = allowedSlices.some(slice => matchesSliceForParent(value, parentNode, slice));
    if (!hasAllowedMatch) {
      issues.push(createIssue(
        'profile-pattern-mismatch',
        parentNode.path,
        `Element '${parentNode.path}' does not match any allowed slice`,
        graph,
      ));
    }
  }
}

function isShadowedForbiddenSliceMatch(
  value: unknown,
  parentNode: ValidationGraphNode,
  slice: ValidationGraphNode,
  allowedSlices: ValidationGraphNode[],
): boolean {
  if (slice.max !== 0 || slice.pattern === undefined) {
    return false;
  }

  return allowedSlices.some(allowedSlice =>
    allowedSlice.pattern !== undefined &&
    patternStrictlyContains(allowedSlice.pattern, slice.pattern) &&
    matchesSliceForParent(value, parentNode, allowedSlice)
  );
}

function validateChoiceNode(
  parentValues: unknown[],
  node: ValidationGraphNode,
  graph: ValidationGraph,
  issues: ValidationIssue[],
  ancestors: Set<ValidationGraphNode>,
): void {
  const required = node.required || (node.min ?? 0) > 0;

  for (const parent of parentValues) {
    const presentEntries = getChoiceEntries(parent, node);
    const present = Array.from(new Set(presentEntries.map(entry => entry.name)));

    if (required && present.length === 0) {
      issues.push(createIssue(
        'structural-required-element-missing',
        node.path,
        `Required choice element '${node.path}' is missing`,
        graph,
      ));
    }

    if (present.length > 1) {
      issues.push(createIssue(
        'structural-choice-multiple',
        node.path,
        `Choice element '${node.path}' has multiple values: ${present.join(', ')}`,
        graph,
      ));
    }

    const choiceValues = presentEntries.map(entry => entry.value);
    for (const value of choiceValues) {
      if (node.fixed !== undefined && !graphValuesMatch(value, node.fixed)) {
        issues.push(createIssue('profile-fixed-value-mismatch', node.path, `Choice '${node.path}' does not match fixed value`, graph));
      }
      if (node.pattern !== undefined) {
        const pattern = matchPatternWithDiagnostic(value, node.pattern, node.path);
        if (!pattern.matches) {
          issues.push(createIssue(
            'profile-pattern-mismatch',
            pattern.path ?? node.path,
            pattern.message ?? `Choice '${node.path}' does not match pattern`,
            graph,
          ));
        }
      }
    }

    for (const entry of presentEntries) {
      const choiceSlice = (node.children ?? []).find(child => child.sliceName === entry.name);
      if (choiceSlice?.pattern !== undefined) {
        const pattern = matchPatternWithDiagnostic(entry.value, choiceSlice.pattern, choiceSlice.path);
        if (!pattern.matches) {
          issues.push(createIssue(
            'profile-pattern-mismatch',
            pattern.path ?? choiceSlice.path,
            pattern.message ?? `Choice slice '${choiceSlice.path}' does not match pattern`,
            graph,
          ));
        }
      }
      if (choiceSlice?.fixed !== undefined && !graphValuesMatch(entry.value, choiceSlice.fixed)) {
        issues.push(createIssue(
          'profile-fixed-value-mismatch',
          choiceSlice.path,
          `Choice slice '${choiceSlice.path}' does not match fixed value`,
          graph,
        ));
      }
      const choiceChildren = choiceSlice?.children ?? (node.children ?? []).filter(child => !child.sliceName);
      for (const child of choiceChildren) {
        if (child.sliceName) {
          continue;
        }
        validateNodeForParents([entry.value], child, graph, issues, ancestors);
      }
    }
  }
}

function getChoiceEntries(parent: unknown, node: ValidationGraphNode): Array<{ name: string; value: unknown }> {
  if (!isRecord(parent)) {
    return [];
  }

  const configuredChoices = node.choices ?? [];
  const names = configuredChoices.length > 0
    ? configuredChoices
    : Object.keys(parent).filter(key => isChoiceProperty(key, node.name));

  return names.flatMap(name => getDirectValues(parent, name).map(value => ({ name, value })));
}
