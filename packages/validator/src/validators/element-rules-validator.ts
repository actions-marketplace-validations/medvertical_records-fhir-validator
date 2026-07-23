import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import type { ElementDefinition } from '../core/structure-definition-types';
import { isDeepStrictEqual } from 'util';
import { validateElementValueBounds } from './element-rule-value-bounds';
import { constraintTypeMatchesElement } from './element-constraint-type';

export class ElementRulesValidator {
  validate(
    value: any,
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
    value: any,
    elementDef: ElementDefinition,
    path: string,
    profileUrl?: string
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const elementAny = elementDef as unknown as Record<string, unknown>;

    if (value === undefined || value === null) {
      // Nothing to validate when the element is absent
      return issues;
    }

    const fixedKeys = Object.keys(elementAny).filter((key) =>
      key.startsWith('fixed') && constraintTypeMatchesElement(elementDef, key)
    );
    for (const fixedKey of fixedKeys) {
      const expected = elementAny[fixedKey];
      if (!this.matchesFixedValue(value, expected)) {
        issues.push(createValidationIssue({
          code: 'profile-fixed-value-mismatch',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, expected: JSON.stringify(expected), actual: JSON.stringify(value) },
        }));
      }
    }

    const patternKeys = Object.keys(elementAny).filter((key) =>
      key.startsWith('pattern') && constraintTypeMatchesElement(elementDef, key)
    );
    for (const patternKey of patternKeys) {
      const pattern = elementAny[patternKey];
      const patternMatch = this.checkPatternMatch(value, pattern, path);
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
      if (typeof elementAny.minLength === 'number' && value.length < elementAny.minLength) {
        issues.push(createValidationIssue({
          code: 'profile-min-length',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, minLength: elementAny.minLength, actualLength: value.length },
        }));
      }

      if (typeof elementAny.maxLength === 'number' && value.length > elementAny.maxLength) {
        issues.push(createValidationIssue({
          code: 'profile-max-length',
          path,
          resourceType: 'Unknown',
          profile: profileUrl,
          messageParams: { path, maxLength: elementAny.maxLength, actualLength: value.length },
        }));
      }
    }

    issues.push(...validateElementValueBounds(value, elementAny, path, profileUrl));

    return issues;
  }

  private matchesFixedValue(value: any, expected: any): boolean {
    if (expected === undefined || expected === null) {
      return true;
    }

    return isDeepStrictEqual(value, expected);
  }

  private checkPatternMatch(value: any, pattern: any, basePath: string): { matches: boolean; message?: string; mismatchedPath?: string } {
    if (pattern === undefined || pattern === null) {
      return { matches: true };
    }

    if (typeof pattern !== 'object' || pattern === null) {
      const matches = isDeepStrictEqual(value, pattern);
      if (!matches) {
        return {
          matches: false,
          message: `Element '${basePath}' does not match pattern: expected '${pattern}', found '${value}'`,
          mismatchedPath: basePath
        };
      }
      return { matches: true };
    }

    if (typeof value !== 'object' || value === null) {
      return {
        matches: false,
        message: `Element '${basePath}' is not an object but pattern requires object structure`,
        mismatchedPath: basePath
      };
    }

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
          return this.checkPatternMatch(actualItem, patternItem, `${basePath}[${i}]`).matches;
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

    for (const key of Object.keys(pattern)) {
      if (!(key in value)) {
        return {
          matches: false,
          message: `Element '${basePath}.${key}' is missing but required by pattern`,
          mismatchedPath: `${basePath}.${key}`
        };
      }
      const propMatch = this.checkPatternMatch(value[key], pattern[key], `${basePath}.${key}`);
      if (!propMatch.matches) {
        return propMatch;
      }
    }

    return { matches: true };
  }

}
