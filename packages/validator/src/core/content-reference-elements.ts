import type { ElementDefinition } from './structure-definition-types';

export function expandContentReferenceElements(elements: ElementDefinition[]): ElementDefinition[] {
  const expanded: ElementDefinition[] = [...elements];
  const seen = new Set(elements.map(element => element.id ?? element.path));

  for (const element of elements) {
    const referencePath = getContentReferencePath(element);
    if (!referencePath || referencePath === element.path) continue;

    const referenceChildPrefix = `${referencePath}.`;
    for (const referenceChild of elements) {
      if (!referenceChild.path.startsWith(referenceChildPrefix)) continue;

      const suffix = referenceChild.path.slice(referencePath.length);
      const path = `${element.path}${suffix}`;
      const id = rewriteContentReferenceId(referenceChild.id, referencePath, element.id ?? element.path, path);
      const key = id ?? path;
      if (seen.has(key)) continue;

      expanded.push({
        ...referenceChild,
        id,
        path,
      });
      seen.add(key);
    }
  }

  return expanded;
}

function getContentReferencePath(element: ElementDefinition): string | null {
  return typeof element.contentReference === 'string' && element.contentReference.startsWith('#')
    ? element.contentReference.slice(1)
    : null;
}

function rewriteContentReferenceId(
  referenceId: string | undefined,
  referencePath: string,
  targetBase: string,
  fallbackPath: string,
): string {
  return referenceId?.startsWith(referencePath)
    ? `${targetBase}${referenceId.slice(referencePath.length)}`
    : fallbackPath;
}
