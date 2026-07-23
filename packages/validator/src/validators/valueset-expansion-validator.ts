import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { stripVersion } from './terminology-resource-utils';

/**
 * Apply the best-practice rules Java raises against `ValueSet.expansion`.
 */
export function validateValueSetExpansion(expansion: any, compose?: any): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const params: any[] = Array.isArray(expansion?.parameter) ? expansion.parameter : [];

  if (params.length === 0) {
    issues.push(createValidationIssue({
      code: 'tx-valueset-expansion-no-parameters',
      path: 'ValueSet.expansion',
      resourceType: 'ValueSet',
      customMessage:
        `This expansion has no parameters; in the absence of the parameters that ` +
        `controlled the expansion, systems may not be able to determine whether ` +
        `it is safe to use this expansion`,
      severityOverride: 'warning',
    }));
  }

  if (typeof expansion?.identifier !== 'string' || expansion.identifier.length === 0) {
    issues.push(createValidationIssue({
      code: 'tx-valueset-expansion-no-identifier',
      path: 'ValueSet.expansion',
      resourceType: 'ValueSet',
      customMessage:
        `This expansion has no identifier. Identifiers are recommended to help ` +
        `with audit and traceability`,
      severityOverride: 'information',
    }));
  }

  const declaredUsedCodesystems = collectDeclaredUsedCodesystems(params);
  issues.push(...validateUnversionedExpansionSystems(expansion, declaredUsedCodesystems));
  issues.push(...validateHierarchicalFilterExpansionConsistency(expansion, compose));

  return issues;
}

/**
 * A `parent = X` include selects concepts whose parent is X; it does not
 * select X itself. This consistency check catches an expansion that includes
 * the filter anchor as an extra code without requiring a terminology server.
 */
function validateHierarchicalFilterExpansionConsistency(
  expansion: any,
  compose: any,
): ValidationIssue[] {
  const contains = flattenContains(expansion?.contains);
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const include of compose?.include ?? []) {
    if (typeof include?.system !== 'string' || !Array.isArray(include?.filter)) continue;
    for (const filter of include.filter) {
      if (filter?.property !== 'parent' || filter?.op !== '=' || typeof filter?.value !== 'string') continue;
      const extra = contains.find(item =>
        item?.system === include.system && item?.code === filter.value
      );
      if (!extra) continue;

      const key = `${include.system}|${filter.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(createValidationIssue({
        code: 'tx-valueset-expansion-extra-code',
        path: 'ValueSet.expansion',
        resourceType: 'ValueSet',
        customMessage:
          `The expansion provided has an extra code ${filter.value} that is not ` +
          'selected by the compose parent filter',
        severityOverride: 'warning',
        details: {
          system: include.system,
          code: filter.value,
          filterProperty: filter.property,
          filterOperator: filter.op,
        },
      }));
    }
  }

  return issues;
}

function flattenContains(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  const out: any[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    out.push(item);
    out.push(...flattenContains((item as any).contains));
  }
  return out;
}

function collectDeclaredUsedCodesystems(params: any[]): Set<string> {
  const declaredUsedCodesystems = new Set<string>();
  for (const p of params) {
    if (p?.name === 'used-codesystem' && typeof p.valueUri === 'string') {
      declaredUsedCodesystems.add(stripVersion(p.valueUri));
    }
  }
  return declaredUsedCodesystems;
}

function validateUnversionedExpansionSystems(
  expansion: any,
  declaredUsedCodesystems: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(expansion.contains)) return issues;

  const seen = new Set<string>();
  for (let i = 0; i < expansion.contains.length; i++) {
    const contains = expansion.contains[i];
    const system: string | undefined = typeof contains?.system === 'string' ? contains.system : undefined;
    if (!system) continue;
    if (system.includes('|') || (typeof contains.version === 'string' && contains.version.length > 0)) continue;
    if (declaredUsedCodesystems.has(system)) continue;
    if (seen.has(system)) continue;
    seen.add(system);
    issues.push(createValidationIssue({
      code: 'tx-valueset-expansion-system-no-version',
      path: 'ValueSet.expansion',
      resourceType: 'ValueSet',
      customMessage:
        `Because the expansion uses system '${system}' without a version, ` +
        `it should list the system using the expansion parameter 'used-codesystem'`,
      severityOverride: 'warning',
    }));
  }

  return issues;
}
