import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import type { ElementDefinition } from '../core/structure-definition-types';
import { isDeepStrictEqual } from 'util';
import { validateElementValueBounds } from './element-rule-value-bounds';
import { constraintTypeMatchesElement } from './element-constraint-type';

export class ElementRulesValidator {
  validate(
    value: unknown,
    elementDef: ElementDefinition,
    path: string,
    profileUrl?: string
  ): ValidationIssue[] {
    if (Array.isArray(value)) {
      const issues: ValidationIssue[] = [];
      value.forEach((item, index) => {
        issues.push(
          ...this.validateSingle(item, elementDef, `${path}[${index}]`, profileUrl)
        );
      });
      return issues;
    }

    return this.validateSingle(value, elementDef, path, profileUrl);
  }

  private validateSingle(
    value: unknown,
    elementDef: ElementDefinition,
    path: string,
    profileUrl?: string
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (value === undefined || value === null) {
      // Nothing to validate when the element is absent
      return issues;
    }

    const fixedKeys = Object.keys(elementDef).filter((key) =>
      key.startsWith('fixed') && constraintTypeMatchesElement(elementDef, key)
    );
    for (const fixedKey of fixedKeys) {
      const expected = elementDef[fixedKey];
      if (!this.matchesFixedValue(value, expected)) {
        issues.push(createValidationIssue({
          code: 'profile-fixed-value-mismatch',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, expected: formatValue(expected), actual: formatValue(value) },
        }));
      }
    }

    const patternKeys = Object.keys(elementDef).filter((key) =>
      key.startsWith('pattern') && constraintTypeMatchesElement(elementDef, key)
    );
    for (const patternKey of patternKeys) {
      const pattern = elementDef[patternKey];
      const patternMatch = this.checkPatternMatch(
        value,
        pattern,
        path,
        new WeakMap<object, WeakSet<object>>(),
      );
      if (!patternMatch.matches) {
        issues.push(createValidationIssue({
          code: 'profile-pattern-mismatch',
          path: patternMatch.mismatchedPath || path,
          resourceType: 'Unknown',
          profile: profileUrl,
          customMessage: patternMatch.message || 'Pattern mismatch',
        }));
      }
    }

    if (typeof value === 'string') {
      if (typeof elementDef.minLength === 'number' && value.length < elementDef.minLength) {
        issues.push(createValidationIssue({
          code: 'profile-min-length',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, minLength: elementDef.minLength, actualLength: value.length },
        }));
      }

      if (typeof elementDef.maxLength === 'number' && value.length > elementDef.maxLength) {
        issues.push(createValidationIssue({
          code: 'profile-max-length',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, maxLength: elementDef.maxLength, actualLength: value.length },
        }));
      }
    }

    issues.push(...validateElementValueBounds(value, elementDef, path, profileUrl));

    return issues;
  }

  private matchesFixedValue(value: unknown, expected: unknown): boolean {
    if (expected === undefined || expected === null) {
      return true;
    }

    return isDeepStrictEqual(value, expected);
  }

  private checkPatternMatch(
    value: unknown,
    pattern: unknown,
    basePath: string,
    visitedPairs: WeakMap<object, WeakSet<object>>,
  ): { matches: boolean; message?: string; mismatchedPath?: string } {
    if (pattern === undefined || pattern === null) {
      return { matches: true };
    }

    if (!isObjectLike(pattern)) {
      const matches = isDeepStrictEqual(value, pattern);
      if (!matches) {
        return {
          matches: false,
          message:
            `Element '${basePath}' does not match pattern: ` +
            `expected '${String(pattern)}', found '${String(value)}'`,
          mismatchedPath: basePath
        };
      }
      return { matches: true };
    }

    if (!isObjectLike(value)) {
      return {
        matches: false,
        message: `Element '${basePath}' is not an object but pattern requires object structure`,
        mismatchedPath: basePath
      };
    }

    if (hasVisitedPair(visitedPairs, pattern, value)) {
      return { matches: true };
    }
    markVisitedPair(visitedPairs, pattern, value);

    try {
      if (Array.isArray(pattern)) {
      if (!Array.isArray(value)) {
        return {
          matches: false,
          message: `Element '${basePath}' is not an array but pattern requires array`,
          mismatchedPath: basePath
        };
      }

      for (let i = 0; i < pattern.length; i++) {
        const patternItem = pattern[i];
        const matchIndex = value.findIndex((actualItem) => {
          return this.checkPatternMatch(
            actualItem,
            patternItem,
            `${basePath}[${i}]`,
            visitedPairs,
          ).matches;
        });

        if (matchIndex === -1) {
          return {
            matches: false,
            message: `Element '${basePath}' does not contain an item matching pattern entry ${i}`,
            mismatchedPath: `${basePath}[${i}]`
          };
        }
      }
      return { matches: true };
      }

      if (Array.isArray(value)) {
        return {
          matches: false,
          message: `Element '${basePath}' is an array but pattern requires object structure`,
          mismatchedPath: basePath,
        };
      }

      const patternRecord = pattern as Record<string, unknown>;
      const valueRecord = value as Record<string, unknown>;
      for (const key of Object.keys(patternRecord)) {
        if (!(key in valueRecord)) {
          return {
            matches: false,
            message: `Element '${basePath}.${key}' is missing but required by pattern`,
            mismatchedPath: `${basePath}.${key}`
          };
        }
        const propMatch = this.checkPatternMatch(
          valueRecord[key],
          patternRecord[key],
          `${basePath}.${key}`,
          visitedPairs,
        );
        if (!propMatch.matches) {
          return propMatch;
        }
      }

      return { matches: true };
    } finally {
      unmarkVisitedPair(visitedPairs, pattern, value);
    }
  }

}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function hasVisitedPair(
  visitedPairs: WeakMap<object, WeakSet<object>>,
  pattern: object,
  value: object,
): boolean {
  return visitedPairs.get(pattern)?.has(value) ?? false;
}

function markVisitedPair(
  visitedPairs: WeakMap<object, WeakSet<object>>,
  pattern: object,
  value: object,
): void {
  const values = visitedPairs.get(pattern) ?? new WeakSet<object>();
  values.add(value);
  visitedPairs.set(pattern, values);
}

function unmarkVisitedPair(
  visitedPairs: WeakMap<object, WeakSet<object>>,
  pattern: object,
  value: object,
): void {
  visitedPairs.get(pattern)?.delete(value);
}

function formatValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}
