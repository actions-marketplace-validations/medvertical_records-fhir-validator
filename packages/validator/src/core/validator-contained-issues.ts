import type { ValidationIssue } from '../types';

export function rebaseContainedIssue(
  issue: ValidationIssue,
  parentResourceType: string,
  containedResource: any,
  containedIndex: number,
): ValidationIssue {
  const containedResourceType = containedResource.resourceType as string;
  const originalPath = issue.path || '';
  const containedPrefix = `${parentResourceType}.contained[${containedIndex}]`;
  const rebasedPath = originalPath === containedResourceType
    ? containedPrefix
    : originalPath.startsWith(`${containedResourceType}.`)
      ? `${containedPrefix}.${originalPath.slice(containedResourceType.length + 1)}`
      : originalPath ? `${containedPrefix}.${originalPath}` : containedPrefix;
  const existingDetails = issue.details && typeof issue.details === 'object' ? issue.details : {};

  return {
    ...issue,
    path: rebasedPath,
    resourceType: parentResourceType,
    details: {
      ...existingDetails,
      containedResourceType,
      ...(containedResource.id ? { containedResourceId: containedResource.id } : {}),
      originalPath,
    },
  };
}

export function isResolvedContainedReferenceIssue(
  issue: ValidationIssue,
  containingResource: any,
): boolean {
  if (issue.code !== 'reference-contained-unresolved' && issue.code !== 'reference-ref1-invariant') return false;
  const containedId = issue.details && typeof issue.details === 'object'
    ? issue.details.containedId
    : undefined;
  return typeof containedId === 'string' && containingResource.contained.some(
    (candidate: any) => candidate?.id === containedId,
  );
}
