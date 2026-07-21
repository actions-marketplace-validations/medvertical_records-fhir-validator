import type { StructureDefinition, ElementDefinition } from './structure-definition-types';
import { StructureDefinitionLoader } from './structure-definition-loader';
import { logger } from '../logger';

export interface SnapshotGenerationOptions {
  includeBaseElements?: boolean;
  applyConstraints?: boolean;
  cacheResults?: boolean;
}

export class SnapshotGenerator {
  private sdLoader: StructureDefinitionLoader;
  private snapshotCache: Map<string, ElementDefinition[]> = new Map();
  private readonly maxCacheEntries: number;

  constructor(sdLoader: StructureDefinitionLoader, maxCacheEntries: number = 192) {
    this.sdLoader = sdLoader;
    this.maxCacheEntries = Math.max(1, Math.trunc(maxCacheEntries));
  }

  async generateSnapshot(
    profileSD: StructureDefinition,
    options: SnapshotGenerationOptions = {}
  ): Promise<ElementDefinition[]> {
    try {
      if (profileSD.snapshot && profileSD.snapshot.element && profileSD.snapshot.element.length > 0) {
        logger.debug(`[SnapshotGenerator] Snapshot already exists for ${profileSD.url}`);
        return profileSD.snapshot.element;
      }

      const snapshotCacheKey = this.getSnapshotCacheKey(profileSD);
      if (options.cacheResults !== false && this.snapshotCache.has(snapshotCacheKey)) {
        logger.debug(`[SnapshotGenerator] Using cached snapshot for ${profileSD.url}`);
        return this.snapshotCache.get(snapshotCacheKey)!;
      }

      logger.info(`[SnapshotGenerator] Generating snapshot for ${profileSD.url}`);

      const baseProfile = await this.loadBaseProfile(profileSD.baseDefinition);

      if (!baseProfile) {
        logger.warn(`[SnapshotGenerator] No base profile found for ${profileSD.url}, using differential only`);
        return profileSD.differential?.element || [];
      }

      let baseSnapshot = baseProfile.snapshot?.element || [];

      if (baseSnapshot.length === 0 && baseProfile.differential) {
        baseSnapshot = await this.generateSnapshot(baseProfile, options);
      }

      const differential = this.inferLegacySliceIds(profileSD.differential?.element || []);
      const snapshot = this.mergeElements(baseSnapshot, differential, profileSD.type);

      if (options.applyConstraints !== false) {
        this.applyConstraints(snapshot, differential);
      }

      if (options.cacheResults !== false) {
        this.snapshotCache.delete(snapshotCacheKey);
        while (this.snapshotCache.size >= this.maxCacheEntries) {
          const oldestKey = this.snapshotCache.keys().next().value;
          if (oldestKey === undefined) break;
          this.snapshotCache.delete(oldestKey);
        }
        this.snapshotCache.set(snapshotCacheKey, snapshot);
      }

      logger.info(`[SnapshotGenerator] Generated ${snapshot.length} elements for ${profileSD.url}`);
      return snapshot;

    } catch (error: unknown) {
      logger.error(`[SnapshotGenerator] Error generating snapshot for ${profileSD.url}:`, error);
      return profileSD.differential?.element || [];
    }
  }

  private getSnapshotCacheKey(profileSD: StructureDefinition): string {
    const version = (profileSD as { version?: string }).version ?? 'unversioned';
    const fhirVersion = (profileSD as { fhirVersion?: string }).fhirVersion ?? 'fhir-any';
    return `${profileSD.url}|${version}|${fhirVersion}`;
  }

  private async loadBaseProfile(baseUrl?: string): Promise<StructureDefinition | null> {
    if (!baseUrl) {
      return null;
    }

    try {
      logger.debug(`[SnapshotGenerator] Loading base profile: ${baseUrl}`);
      const baseProfile = await this.sdLoader.loadProfile(baseUrl);
      return baseProfile;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[SnapshotGenerator] Failed to load base profile ${baseUrl}:`, err.message);
      return null;
    }
  }

  private mergeElements(
    baseElements: ElementDefinition[],
    differentialElements: ElementDefinition[],
    _resourceType: string
  ): ElementDefinition[] {
    const mergedElements: ElementDefinition[] = JSON.parse(JSON.stringify(baseElements));
    const scopedDifferentialElements = this.inferLegacySliceIds(differentialElements);
    const baseElementMap = new Map<string, number>();
    mergedElements.forEach((element, index) => {
      if (element.path && !element.sliceName && !this.isSliceScopedElement(element)) {
        baseElementMap.set(element.path, index);
      }
    });

    for (const diffElement of scopedDifferentialElements) {
      if (!diffElement.path) continue;

      const path = diffElement.path;
      const isSliceInstance = !!diffElement.sliceName;
      // Sub-elements defined *inside* a slice section carry the slice name
      // via their `id` (e.g. `Observation.referenceRange:Slice1.type`) even
      // though `sliceName` itself is only set on the top-level slice entry.
      // These sub-elements must NOT be merged into the base element at the
      // same path — doing so leaks slice-scoped cardinality / type
      // constraints to every occurrence at that path. Detect them by
      // looking for a `:` in the id segments.
      const isSliceScopedChild = this.isSliceScopedElement(diffElement);

      if (baseElementMap.has(path) && !isSliceInstance && !isSliceScopedChild) {
        const index = baseElementMap.get(path)!;
        mergedElements[index] = this.mergeElementProperties(
          mergedElements[index],
          diffElement
        );
      } else if (isSliceInstance) {
        // Named slice — if a slice with the same path+sliceName already
        // exists in the base (inherited from a parent profile), merge the
        // differential properties into it so pattern/fixed/cardinality
        // refinements are not lost. Without this, the base slice (without
        // patterns) would shadow the derived one.
        const existingIdx = this.findExistingSliceIndex(mergedElements, diffElement);
        if (existingIdx >= 0) {
          mergedElements[existingIdx] = this.mergeElementProperties(
            mergedElements[existingIdx],
            diffElement
          );
        } else {
          mergedElements.push({ ...diffElement });
        }
      } else {
        mergedElements.push({ ...diffElement });
        if (!baseElementMap.has(path)) {
          baseElementMap.set(path, mergedElements.length - 1);
        }
      }
    }

    mergedElements.sort((a, b) => {
      const pathA = a.path || '';
      const pathB = b.path || '';
      return pathA.localeCompare(pathB);
    });

    return mergedElements;
  }

  /**
   * Older differentials may omit ElementDefinition.id. Slice children are
   * then associated by their position after the named slice root. Give those
   * entries stable synthetic ids so they remain scoped to that slice instead
   * of being merged into (and overwriting) the base path.
   */
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

      if (
        activeSlice &&
        element.path?.startsWith(`${activeSlice.path}.`) &&
        !element.id
      ) {
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
      element.path === diffElement.path &&
      element.sliceName === diffElement.sliceName &&
      this.sliceParentScope(element) === diffScope
    );
  }

  private sliceParentScope(element: ElementDefinition): string {
    if (!element.id || !element.sliceName) return '';

    const sliceSuffix = `:${element.sliceName}`;
    const sliceStart = element.id.lastIndexOf(sliceSuffix);
    if (sliceStart < 0) return '';

    return element.id.slice(0, sliceStart);
  }

  private mergeElementProperties(
    baseElement: ElementDefinition,
    diffElement: ElementDefinition
  ): ElementDefinition {
    const merged = { ...baseElement };

    if (diffElement.min !== undefined) {
      merged.min = Math.max(baseElement.min || 0, diffElement.min);
    }

    if (diffElement.max !== undefined) {
      merged.max = this.restrictMax(baseElement.max, diffElement.max);
    }

    if (diffElement.type) {
      merged.type = this.mergeTypes(baseElement.type, diffElement.type);
    }

    if (diffElement.constraint) {
      merged.constraint = [
        ...(baseElement.constraint || []),
        ...diffElement.constraint
      ];
    }

    if (diffElement.binding) {
      merged.binding = diffElement.binding;
    }

    const propertiesToCopy = [
      'short', 'definition', 'comment', 'requirements',
      'mustSupport', 'isModifier', 'isSummary',
      'meaningWhenMissing', 'fixed', 'pattern',
      'example', 'minValue', 'maxValue', 'maxLength',
      'condition', 'mapping', 'slicing'
    ];

    for (const prop of propertiesToCopy) {
      if ((diffElement as unknown as Record<string, unknown>)[prop] !== undefined) {
        (merged as unknown as Record<string, unknown>)[prop] = (diffElement as unknown as Record<string, unknown>)[prop];
      }
    }

    // Copy type-specific pattern[x], fixed[x], minValue[x] and maxValue[x]
    // variants (patternCoding, fixedUri, minValueDate, etc.) that FHIR uses
    // for polymorphic ElementDefinition rules.
    const diffRecord = diffElement as unknown as Record<string, unknown>;
    const mergedRecord = merged as unknown as Record<string, unknown>;
    for (const key of Object.keys(diffRecord)) {
      const isPolymorphicRule =
        key.startsWith('pattern') ||
        key.startsWith('fixed') ||
        key.startsWith('minValue') ||
        key.startsWith('maxValue');

      if (isPolymorphicRule && key !== 'pattern' && key !== 'fixed' && key !== 'minValue' && key !== 'maxValue') {
        mergedRecord[key] = diffRecord[key];
      }
    }

    return merged;
  }

  private restrictMax(baseMax?: string, diffMax?: string): string {
    if (!baseMax) return diffMax || '*';
    if (!diffMax) return baseMax;

    if (baseMax === '*') return diffMax;
    if (diffMax === '*') return baseMax;

    const baseNum = parseInt(baseMax, 10);
    const diffNum = parseInt(diffMax, 10);

    return Math.min(baseNum, diffNum).toString();
  }

  private mergeTypes(
    baseTypes?: Array<{ code: string; profile?: string[]; targetProfile?: string[] }>,
    diffTypes?: Array<{ code: string; profile?: string[]; targetProfile?: string[] }>
  ): Array<{ code: string; profile?: string[]; targetProfile?: string[] }> {
    if (!baseTypes) return diffTypes || [];
    if (!diffTypes) return baseTypes;

    const mergedTypes: Array<{ code: string; profile?: string[]; targetProfile?: string[] }> = [];

    for (const diffType of diffTypes) {
      const baseType = baseTypes.find(bt => bt.code === diffType.code);

      if (baseType) {
        const mergedType = { ...baseType };

        if (diffType.profile) {
          mergedType.profile = diffType.profile;
        }

        if (diffType.targetProfile) {
          mergedType.targetProfile = diffType.targetProfile;
        }

        mergedTypes.push(mergedType);
      } else {
        mergedTypes.push(diffType);
      }
    }

    return mergedTypes.length > 0 ? mergedTypes : baseTypes;
  }

  private applyConstraints(
    snapshot: ElementDefinition[],
    differential: ElementDefinition[]
  ): void {
    // Build a map of differential constraints by element path. Skip slice
    // instances and slice-scoped sub-elements — their constraints only
    // apply to the matching slice target, not to the base path, and
    // applying them here re-leaks the same cardinality/type restrictions
    // that mergeElements carefully kept out of the base entry.
    const constraintMap = new Map<string, ElementDefinition>();

    for (const diffElement of differential) {
      if (!diffElement.path) continue;
      if (diffElement.sliceName) continue;
      if (typeof diffElement.id === 'string' && diffElement.id.includes(':')) continue;
      constraintMap.set(diffElement.path, diffElement);
    }

    // Apply constraints to snapshot elements. Only touch snapshot entries
    // whose `id` is *not* slice-scoped either — the slice-scoped copies
    // in the snapshot carry their own constraints from the differential.
    for (const snapElement of snapshot) {
      if (!snapElement.path) continue;
      if (snapElement.sliceName) continue;
      if (typeof snapElement.id === 'string' && snapElement.id.includes(':')) continue;

      const diffElement = constraintMap.get(snapElement.path);
      if (!diffElement) continue;

      if (diffElement.min !== undefined && snapElement.min !== undefined) {
        snapElement.min = Math.max(snapElement.min, diffElement.min);
      }

      if (diffElement.max && snapElement.max) {
        snapElement.max = this.restrictMax(snapElement.max, diffElement.max);
      }

      if (diffElement.mustSupport !== undefined) {
        snapElement.mustSupport = diffElement.mustSupport;
      }

      if (diffElement.isModifier !== undefined) {
        snapElement.isModifier = diffElement.isModifier;
      }
    }
  }

  clearCache(): void {
    this.snapshotCache.clear();
    logger.debug('[SnapshotGenerator] Cache cleared');
  }

  evict(profileUrl: string): boolean {
    let deleted = this.snapshotCache.delete(profileUrl);
    const prefix = `${profileUrl}|`;
    for (const key of [...this.snapshotCache.keys()]) {
      if (key.startsWith(prefix)) {
        deleted = this.snapshotCache.delete(key) || deleted;
      }
    }
    return deleted;
  }

  getCacheStats(): { size: number; profiles: string[] } {
    return {
      size: this.snapshotCache.size,
      profiles: Array.from(this.snapshotCache.keys())
    };
  }
}
