import type { ValidationIssue } from '../../types';
import { createValidationIssue } from '../../issues';
import { ucumCodeHasAnnotation, validateUcumCode } from '../../validators/ucum-validator';
import {
  buildInvalidUcumIssueDetails,
  buildInvalidUcumMessage,
} from './terminology-ucum-rules';

function isCodingHygienePath(path: string): boolean {
  return (
    /\.coding\[\d+\]$/.test(path) ||
    /\.(?:value|answer|pattern|fixed)Coding$/.test(path)
  );
}

export function isValidFhirCodePrimitive(code: string): boolean {
  return /^[^\s]+(?: [^\s]+)*$/.test(code);
}

function hasRawWhitespace(value: string): boolean {
  return /\s/.test(value);
}

export function missingCodingSystemSeverity(
  resourceType: string,
  path: string,
): 'warning' | 'information' {
  if (resourceType !== 'Questionnaire') return 'warning';

  const isQuestionnaireLocalChoiceCoding =
    /\.answerOption\[\d+\]\.valueCoding$/.test(path) ||
    /\.enableWhen\[\d+\]\.answerCoding$/.test(path) ||
    /\.extension\[\d+\](?:\.extension\[\d+\])?\.valueCoding$/.test(path) ||
    /\.extension\[\d+\](?:\.extension\[\d+\])?\.valueCodeableConcept\.coding\[\d+\]$/.test(path);

  return isQuestionnaireLocalChoiceCoding ? 'information' : 'warning';
}

export function validateCodingHygiene(resource: any, existingIssues: ValidationIssue[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set(existingIssues.map(issue => `${issue.code}|${issue.path}`));
  const root = resource?.resourceType || 'Resource';

  const pushOnce = (issue: {
    severity: 'error' | 'warning' | 'information';
    code: string;
    message: string;
    path: string;
    details?: Record<string, unknown>;
  }): void => {
    const key = `${issue.code}|${issue.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(createValidationIssue({
      code: issue.code,
      path: issue.path,
      resourceType: root,
      aspectOverride: 'terminology',
      severityOverride: issue.severity,
      customMessage: issue.message,
      details: issue.details,
    }));
  };

  const visit = (value: any, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (!value || typeof value !== 'object') return;

    if (typeof value.code === 'string' && !value.system && isCodingHygienePath(path)) {
      const details: Record<string, unknown> = {
        code: value.code,
        fieldPath: path,
      };
      if (typeof value.display === 'string') {
        details.display = value.display;
      }

      pushOnce({
        severity: missingCodingSystemSeverity(root, path),
        code: 'terminology-coding-missing-system',
        message: 'Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided',
        path,
        details,
      });
    }

    if (typeof value.code === 'string' && isCodingHygienePath(path) && !isValidFhirCodePrimitive(value.code)) {
      pushOnce({
        severity: 'error',
        code: 'terminology-code-invalid',
        message: `The code '${value.code}' at ${path}.code is not valid (whitespace rules)`,
        path: `${path}.code`,
        details: {
          code: value.code,
          reason: 'code-whitespace',
          fieldPath: `${path}.code`,
        },
      });
    }

    if (typeof value.system === 'string' && isCodingHygienePath(path) && hasRawWhitespace(value.system)) {
      pushOnce({
        severity: 'error',
        code: 'terminology-code-invalid',
        message: `The system '${value.system}' at ${path}.system is not valid (whitespace rules)`,
        path: `${path}.system`,
        details: {
          code: typeof value.code === 'string' ? value.code : '',
          system: value.system,
          reason: 'system-whitespace',
          fieldPath: `${path}.system`,
          fixHint: `Remove whitespace from Coding.system '${value.system}'.`,
        },
      });
    }

    if (value.system === 'http://unitsofmeasure.org' && typeof value.code === 'string') {
      const result = validateUcumCode(value.code);
      if (result.valid && ucumCodeHasAnnotation(value.code)) {
        pushOnce({
          severity: 'information',
          code: 'terminology-ucum-annotation',
          message: `UCUM code '${value.code}' at ${path}.code contains a human-readable annotation. UCUM annotations are ignored semantically, so validation should not depend on them`,
          path: `${path}.code`,
        });
      } else if (!result.valid) {
        pushOnce({
          severity: 'error',
          code: 'terminology-code-invalid',
          message: buildInvalidUcumMessage(value.code, `${path}.code`, result.message),
          path: `${path}.code`,
          details: buildInvalidUcumIssueDetails(value.code, `${path}.code`, result.message),
        });
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (root === 'Bundle' && key === 'resource' && /^Bundle\.entry\[\d+\]$/.test(path)) {
        continue;
      }
      visit(child, `${path}.${key}`);
    }
  };

  visit(resource, root);
  return issues;
}
