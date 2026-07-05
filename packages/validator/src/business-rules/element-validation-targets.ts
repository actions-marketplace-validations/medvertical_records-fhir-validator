/**
 * Array-aware validation target resolution for FHIR element paths.
 */

import { resolveFhirSegmentValue } from '../core/fhir-primitive-sidecar';

/**
 * Validation target for a specific path in a resource.
 * Includes the value, full path with array indices, and context path for parent checking.
 */
export interface ValidationTarget {
  /** Value at the target path */
  value: any;

  /** Full path including array indices (e.g., "Patient.identifier[0].system") */
  fullPath: string;

  /** Context path for parent existence checking (e.g., "Patient.identifier[0]") */
  contextPath: string;

  /** Whether this target is within an array element */
  isArrayElement: boolean;

  /** Array index if this is an array element */
  arrayIndex?: number;
}

/**
 * Check if the value at a given path is an array.
 */
export function isArrayAtPath(resource: any, path: string): boolean {
  const parts = path.split('.');
  if (parts[0] === resource?.resourceType) {
    parts.shift();
  }

  let current: any = resource;
  for (const part of parts) {
    if (current == null) return false;
    if (Array.isArray(current)) {
      current = current[0];
      if (current == null) return false;
    }

    const value = resolveFhirSegmentValue(current, part);
    current = value;
  }

  return Array.isArray(current);
}

/**
 * Expand a path by inserting an array index.
 */
export function expandPathWithArrayIndex(
  path: string,
  arraySegment: string,
  index: number
): string {
  return path
    .split('.')
    .map(part => part === arraySegment ? `${part}[${index}]` : part)
    .join('.');
}

/**
 * Get all validation targets for a path, expanding arrays.
 */
export function getValidationTargets(
  resource: any,
  path: string
): ValidationTarget[] {
  if (!resource || typeof resource !== 'object') {
    return [];
  }

  const parts = path.split('.');
  const startIndex = parts[0] === resource.resourceType ? 1 : 0;
  let targets: Array<{
    current: any;
    pathSoFar: string[];
    resourceTypePart: string;
  }> = [{
    current: resource,
    pathSoFar: [],
    resourceTypePart: parts[0] === resource.resourceType ? parts[0] : ''
  }];

  for (let i = startIndex; i < parts.length; i++) {
    targets = resolveNextSegmentTargets(targets, parts[i]);
  }

  return targets.map(convertToValidationTarget);
}

function resolveNextSegmentTargets(
  targets: Array<{ current: any; pathSoFar: string[]; resourceTypePart: string }>,
  segment: string,
): Array<{ current: any; pathSoFar: string[]; resourceTypePart: string }> {
  const newTargets: typeof targets = [];

  for (const target of targets) {
    if (target.current === undefined || target.current === null) {
      continue;
    }

    const nextValues = resolveSegmentTargets(target.current, segment);
    for (const next of nextValues) {
      if (Array.isArray(next.value)) {
        next.value.forEach((item, arrayIndex) => {
          newTargets.push({
            current: item,
            pathSoFar: [...target.pathSoFar, `${next.pathSegment}[${arrayIndex}]`],
            resourceTypePart: target.resourceTypePart
          });
        });
        continue;
      }

      newTargets.push({
        current: next.value,
        pathSoFar: [...target.pathSoFar, next.pathSegment],
        resourceTypePart: target.resourceTypePart
      });
    }
  }

  return newTargets;
}

function resolveSegmentTargets(
  currentValue: any,
  segment: string,
): Array<{ value: any; pathSegment: string }> {
  if (segment.endsWith('[x]') && currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
    const baseName = segment.slice(0, -3);
    const directChoiceKey = Object.keys(currentValue).find(key => isConcreteChoiceKey(key, baseName));
    if (directChoiceKey) {
      return [{ value: currentValue[directChoiceKey], pathSegment: directChoiceKey }];
    }

    const sidecarChoiceKey = Object.keys(currentValue).find(
      key => key.startsWith('_') && isConcreteChoiceKey(key.slice(1), baseName),
    );
    if (sidecarChoiceKey) {
      return [{
        value: resolveFhirSegmentValue(currentValue, segment),
        pathSegment: sidecarChoiceKey.slice(1),
      }];
    }
  }

  return [{ value: resolveSegmentValue(currentValue, segment), pathSegment: segment }];
}

function isConcreteChoiceKey(key: string, baseName: string): boolean {
  return key.startsWith(baseName) &&
    key.length > baseName.length &&
    key[baseName.length] === key[baseName.length].toUpperCase();
}

function resolveSegmentValue(currentValue: any, segment: string): any {
  return resolveFhirSegmentValue(currentValue, segment);
}

function convertToValidationTarget(target: {
  current: any;
  pathSoFar: string[];
  resourceTypePart: string;
}): ValidationTarget {
  const relativePath = target.pathSoFar.join('.');
  const fullPath = target.resourceTypePart && relativePath
    ? `${target.resourceTypePart}.${relativePath}`
    : target.resourceTypePart || relativePath;
  const contextPathParts = target.pathSoFar.slice(0, -1);
  const contextRelativePath = contextPathParts.join('.');
  const contextPath = target.resourceTypePart && contextRelativePath
    ? `${target.resourceTypePart}.${contextRelativePath}`
    : target.resourceTypePart || contextRelativePath;

  return {
    value: target.current,
    fullPath,
    contextPath: contextPath || target.resourceTypePart,
    isArrayElement: target.pathSoFar.some(segment => /\[\d+\]/.test(segment)),
    arrayIndex: getLastArrayIndex(target.pathSoFar)
  };
}

function getLastArrayIndex(pathSegments: string[]): number | undefined {
  for (let i = pathSegments.length - 1; i >= 0; i--) {
    const match = pathSegments[i].match(/\[(\d+)\]/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}
