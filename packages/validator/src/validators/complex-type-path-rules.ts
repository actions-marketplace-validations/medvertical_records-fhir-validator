import type { ElementDefinition } from '../core/structure-definition-types';
import { getNestedValue } from '../core/executors/structural-executor-helpers';

export function shouldSkipComplexDeepValidation(basePath: string): boolean {
  if (basePath.match(/^StructureDefinition\.(snapshot|differential)\.element/)) {
    return true;
  }
  if (basePath.match(/^Bundle\.entry(\[\d+\])?\.resource/)) {
    return true;
  }
  if (basePath.match(/^Parameters\.parameter(\[\d+\])?(\.part(\[\d+\])?)*\.resource/)) {
    return true;
  }
  return false;
}

export function rewriteChoiceTypeBasePath(basePath: string, typeCode: string): string {
  if (!basePath.endsWith('[x]')) return basePath;
  const stem = basePath.slice(0, -'[x]'.length);
  const typeSuffix = typeCode.charAt(0).toUpperCase() + typeCode.slice(1);
  return stem + typeSuffix;
}

export function parentComplexElementAbsent(value: any, subPath: string): boolean {
  if (!subPath.includes('.')) return false;
  const parentSubPath = subPath.substring(0, subPath.lastIndexOf('.'));
  const parentValue = getNestedValue(value, parentSubPath);
  return (
    parentValue === undefined ||
    parentValue === null ||
    (Array.isArray(parentValue) && parentValue.length === 0)
  );
}

export function narrowChoiceTypeElement(
  subPath: string,
  value: any,
  elementDef: ElementDefinition,
): ElementDefinition {
  if (!subPath.endsWith('[x]') || !value || typeof value !== 'object') return elementDef;
  const prefix = subPath.slice(0, -3);
  const actualKey = Object.keys(value).find(k => k.startsWith(prefix) && k !== prefix);
  if (!actualKey || !elementDef.type || elementDef.type.length <= 1) return elementDef;
  const suffix = actualKey.substring(prefix.length);
  const matched = elementDef.type.find(t => t.code.toLowerCase() === suffix.toLowerCase());
  return matched ? { ...elementDef, type: [matched] } : elementDef;
}
