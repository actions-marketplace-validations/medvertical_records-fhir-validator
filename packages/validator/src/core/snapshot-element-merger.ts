import type { ElementDefinition } from './structure-definition-types';

export class SnapshotElementMerger {
  merge(
    baseElements: ElementDefinition[],
    differentialElements: ElementDefinition[],
    applyConstraints: boolean,
  ): ElementDefinition[] {
    const differential = this.inferLegacySliceIds(differentialElements);
    const snapshot = this.mergeElements(baseElements, differential);
    if (applyConstraints) this.applyConstraints(snapshot, differential);
    return snapshot;
  }

  private mergeElements(
    baseElements: ElementDefinition[],
    differentialElements: ElementDefinition[],
  ): ElementDefinition[] {
    const mergedElements = JSON.parse(JSON.stringify(baseElements)) as ElementDefinition[];
    const baseElementMap = new Map<string, number>();
    mergedElements.forEach((element, index) => {
      if (element.path && !element.sliceName && !this.isSliceScopedElement(element)) {
        baseElementMap.set(element.path, index);
      }
    });

    for (const diffElement of differentialElements) {
      if (!diffElement.path) continue;
      const path = diffElement.path;
      const isSliceInstance = Boolean(diffElement.sliceName);
      const isSliceScopedChild = this.isSliceScopedElement(diffElement);

      if (baseElementMap.has(path) && !isSliceInstance && !isSliceScopedChild) {
        const index = baseElementMap.get(path)!;
        mergedElements[index] = this.mergeElementProperties(mergedElements[index], diffElement);
      } else if (isSliceInstance) {
        const existingIndex = this.findExistingSliceIndex(mergedElements, diffElement);
        if (existingIndex >= 0) {
          mergedElements[existingIndex] = this.mergeElementProperties(
            mergedElements[existingIndex],
            diffElement,
          );
        } else {
          mergedElements.push({ ...diffElement });
        }
      } else {
        mergedElements.push({ ...diffElement });
        if (!baseElementMap.has(path)) baseElementMap.set(path, mergedElements.length - 1);
      }
    }

    mergedElements.sort((left, right) =>
      (left.path || '').localeCompare(right.path || '')
    );
    return mergedElements;
  }

  private inferLegacySliceIds(elements: ElementDefinition[]): ElementDefinition[] {
    let activeSlice: { path: string; name: string; id: string } | null = null;
    return elements.map(source => {
      const element = { ...source };
      if (element.sliceName && element.path) {
        const id = element.id || `${element.path}:${element.sliceName}`;
        activeSlice = { path: element.path, name: element.sliceName, id };
        element.id = id;
        return element;
      }
      if (activeSlice && element.path?.startsWith(`${activeSlice.path}.`) && !element.id) {
        element.id = `${activeSlice.id}${element.path.slice(activeSlice.path.length)}`;
        return element;
      }
      if (activeSlice && element.path && !element.path.startsWith(`${activeSlice.path}.`)) {
        activeSlice = null;
      }
      return element;
    });
  }

  private isSliceScopedElement(element: ElementDefinition): boolean {
    return typeof element.id === 'string' && element.id.includes(':');
  }

  private findExistingSliceIndex(
    elements: ElementDefinition[],
    diffElement: ElementDefinition,
  ): number {
    if (diffElement.id) {
      const exactIdIndex = elements.findIndex(element => element.id === diffElement.id);
      if (exactIdIndex >= 0) return exactIdIndex;
    }
    const diffScope = this.sliceParentScope(diffElement);
    return elements.findIndex(element =>
      element.path === diffElement.path
      && element.sliceName === diffElement.sliceName
      && this.sliceParentScope(element) === diffScope
    );
  }

  private sliceParentScope(element: ElementDefinition): string {
    if (!element.id || !element.sliceName) return '';
    const sliceStart = element.id.lastIndexOf(`:${element.sliceName}`);
    return sliceStart < 0 ? '' : element.id.slice(0, sliceStart);
  }

  private mergeElementProperties(
    baseElement: ElementDefinition,
    diffElement: ElementDefinition,
  ): ElementDefinition {
    const merged = { ...baseElement };
    if (diffElement.min !== undefined) merged.min = Math.max(baseElement.min || 0, diffElement.min);
    if (diffElement.max !== undefined) merged.max = restrictMax(baseElement.max, diffElement.max);
    if (diffElement.type) merged.type = mergeTypes(baseElement.type, diffElement.type);
    if (diffElement.constraint) {
      merged.constraint = [...(baseElement.constraint || []), ...diffElement.constraint];
    }
    if (diffElement.extension) {
      merged.extension = mergeExtensions(baseElement.extension, diffElement.extension);
    }
    if (diffElement.binding) merged.binding = diffElement.binding;

    const propertiesToCopy = [
      'short', 'definition', 'comment', 'requirements',
      'mustSupport', 'isModifier', 'isSummary',
      'mustHaveValue', 'valueAlternatives',
      'meaningWhenMissing', 'fixed', 'pattern',
      'example', 'minValue', 'maxValue', 'maxLength',
      'condition', 'mapping', 'slicing',
    ];
    for (const property of propertiesToCopy) {
      if (diffElement[property] !== undefined) merged[property] = diffElement[property];
    }
    for (const key of Object.keys(diffElement)) {
      const isPolymorphicRule = key.startsWith('pattern')
        || key.startsWith('fixed')
        || key.startsWith('minValue')
        || key.startsWith('maxValue');
      if (isPolymorphicRule && !['pattern', 'fixed', 'minValue', 'maxValue'].includes(key)) {
        merged[key] = diffElement[key];
      }
    }
    return merged;
  }

  private applyConstraints(
    snapshot: ElementDefinition[],
    differential: ElementDefinition[],
  ): void {
    const constraintMap = new Map<string, ElementDefinition>();
    for (const element of differential) {
      if (!element.path || element.sliceName || this.isSliceScopedElement(element)) continue;
      constraintMap.set(element.path, element);
    }
    for (const element of snapshot) {
      if (!element.path || element.sliceName || this.isSliceScopedElement(element)) continue;
      const constraint = constraintMap.get(element.path);
      if (!constraint) continue;
      if (constraint.min !== undefined && element.min !== undefined) {
        element.min = Math.max(element.min, constraint.min);
      }
      if (constraint.max && element.max) element.max = restrictMax(element.max, constraint.max);
      if (constraint.mustSupport !== undefined) element.mustSupport = constraint.mustSupport;
      if (constraint.isModifier !== undefined) element.isModifier = constraint.isModifier;
    }
  }
}

function mergeExtensions(
  baseExtensions: Array<Record<string, unknown>> | undefined,
  differentialExtensions: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const overriddenUrls = new Set(differentialExtensions.flatMap(extension =>
    typeof extension.url === 'string' ? [extension.url] : [],
  ));
  return [
    ...(baseExtensions ?? []).filter(extension =>
      typeof extension.url !== 'string' || !overriddenUrls.has(extension.url),
    ),
    ...differentialExtensions,
  ];
}

function restrictMax(baseMax?: string, diffMax?: string): string {
  if (!baseMax) return diffMax || '*';
  if (!diffMax) return baseMax;
  if (baseMax === '*') return diffMax;
  if (diffMax === '*') return baseMax;
  return Math.min(Number.parseInt(baseMax, 10), Number.parseInt(diffMax, 10)).toString();
}

type ElementType = { code: string; profile?: string[]; targetProfile?: string[] };

function mergeTypes(baseTypes?: ElementType[], diffTypes?: ElementType[]): ElementType[] {
  if (!baseTypes) return diffTypes || [];
  if (!diffTypes) return baseTypes;
  const merged = diffTypes.map(diffType => {
    const baseType = baseTypes.find(candidate => candidate.code === diffType.code);
    if (!baseType) return diffType;
    return {
      ...baseType,
      ...(diffType.profile ? { profile: diffType.profile } : {}),
      ...(diffType.targetProfile ? { targetProfile: diffType.targetProfile } : {}),
    };
  });
  return merged.length > 0 ? merged : baseTypes;
}
