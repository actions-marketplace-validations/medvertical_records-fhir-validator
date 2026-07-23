import type { ValidationIssue } from '../../types';
import type { ValueSetValidator } from '../../validators/valueset-validator';
import { validateLocalCodeSystemCoding } from './terminology-external-code-system-rules';

function isCodingPath(path: string): boolean {
  return /\.coding\[\d+\]$/.test(path) || /\.(?:value|answer|pattern|fixed)Coding$/.test(path);
}

/**
 * Validate Coding instances below complex datatypes (for example
 * Identifier.type.coding). Core resource snapshots often stop at the
 * datatype boundary, so the StructureDefinition-driven terminology pass
 * cannot see these children.
 */
export async function validateDeepLocalCodings(
  resource: any,
  existingIssues: ValidationIssue[],
  valuesetValidator: ValueSetValidator,
  fhirVersion: 'R4' | 'R5' | 'R6',
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const seen = new Set(existingIssues.map(issue => `${issue.code}|${issue.path}`));
  const root = resource?.resourceType || 'Resource';

  const visit = async (value: any, path: string): Promise<void> => {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        await visit(value[index], `${path}[${index}]`);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (isCodingPath(path)) {
      const localIssues = await validateLocalCodeSystemCoding(
        value,
        path,
        valuesetValidator,
        fhirVersion,
      );
      for (const issue of localIssues) {
        const key = `${issue.code}|${issue.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ ...issue, resourceType: root });
      }
    }

    for (const [key, child] of Object.entries(value)) {
      // Bundle entries are validated as their own resources by the recursive
      // batch path; do not duplicate their terminology findings on Bundle.
      if (root === 'Bundle' && key === 'resource' && /^Bundle\.entry\[\d+\]$/.test(path)) continue;
      await visit(child, `${path}.${key}`);
    }
  };

  await visit(resource, root);
  return issues;
}
