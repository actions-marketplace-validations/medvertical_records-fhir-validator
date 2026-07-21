/**
 * Validates referenced resources recursively with configurable depth limits.
 * Prevents infinite loops using circular reference detection.
 */

import { getCircularReferenceDetector } from './circular-reference-detector';
import {
  extractReferencesToValidate,
  filterReferences,
  getResourceIdentifier,
  isTimeoutReached,
  resolveBundleReference,
  resolveContainedReference,
  type ReferenceToValidate,
} from './recursive-reference-helpers';
import { logger } from '../logger';

export interface RecursiveValidationConfig {
  enabled: boolean;
  maxDepth: number;
  validateExternal: boolean;
  validateContained: boolean;
  validateBundleEntries: boolean;
  excludeResourceTypes?: string[];
  maxReferencesPerResource?: number;
  timeoutMs?: number;
}

export interface RecursiveValidationContext {
  currentDepth: number;
  referenceChain: string[];
  validatedResources: Set<string>;
  startTime: number;
  config: RecursiveValidationConfig;
}

export interface RecursiveValidationResult {
  totalResourcesValidated: number;
  maxDepthReached: number;
  referencesFollowed: number;
  unresolvedReferences: string[];
  circularReferences: string[][];
  validationTimeMs: number;
  timedOut: boolean;
}

export class RecursiveReferenceValidator {
  private circularDetector = getCircularReferenceDetector();
  private defaultConfig: RecursiveValidationConfig = {
    enabled: false,
    maxDepth: 1,
    validateExternal: false,
    validateContained: true,
    validateBundleEntries: true,
    excludeResourceTypes: [],
    maxReferencesPerResource: 10,
    timeoutMs: 30000,
  };

  async validateRecursively(
    resource: any,
    config: Partial<RecursiveValidationConfig> = {},
    resourceFetcher?: (reference: string) => Promise<any>
  ): Promise<RecursiveValidationResult> {
    const fullConfig: RecursiveValidationConfig = {
      ...this.defaultConfig,
      ...config,
    };

    if (fullConfig.maxDepth > 3) {
      logger.warn('[RecursiveReferenceValidator] Max depth capped at 3 for safety');
      fullConfig.maxDepth = 3;
    }

    const context: RecursiveValidationContext = {
      currentDepth: 0,
      referenceChain: [],
      validatedResources: new Set<string>(),
      startTime: Date.now(),
      config: fullConfig,
    };

    const result: RecursiveValidationResult = {
      totalResourcesValidated: 0,
      maxDepthReached: 0,
      referencesFollowed: 0,
      unresolvedReferences: [],
      circularReferences: [],
      validationTimeMs: 0,
      timedOut: false,
    };

    if (!fullConfig.enabled) {
      logger.debug('[RecursiveReferenceValidator] Recursive validation disabled');
      return result;
    }

    await this.validateResourceRecursively(
      resource,
      context,
      result,
      resourceFetcher
    );

    result.validationTimeMs = Date.now() - context.startTime;

    const logCompletion = result.validationTimeMs > 100 ? logger.info.bind(logger) : logger.debug.bind(logger);
    logCompletion(
      `[RecursiveReferenceValidator] Completed: ` +
      `${result.totalResourcesValidated} resources, ` +
      `${result.referencesFollowed} references, ` +
      `max depth: ${result.maxDepthReached}, ` +
      `time: ${result.validationTimeMs}ms`
    );

    return result;
  }

  private async validateResourceRecursively(
    resource: any,
    context: RecursiveValidationContext,
    result: RecursiveValidationResult,
    resourceFetcher?: (reference: string) => Promise<any>
  ): Promise<void> {
    if (!resource || typeof resource !== 'object') {
      return;
    }

    if (isTimeoutReached(context)) {
      logger.warn('[RecursiveReferenceValidator] Timeout reached');
      result.timedOut = true;
      return;
    }

    if (context.currentDepth >= context.config.maxDepth) {
      logger.debug(`[RecursiveReferenceValidator] Max depth ${context.config.maxDepth} reached`);
      return;
    }

    const resourceId = getResourceIdentifier(resource);
    if (context.validatedResources.has(resourceId)) {
      return;
    }

    context.validatedResources.add(resourceId);
    result.totalResourcesValidated++;
    result.maxDepthReached = Math.max(result.maxDepthReached, context.currentDepth);

    logger.debug(
      `[RecursiveReferenceValidator] [Depth ${context.currentDepth}] Validating ${resource.resourceType}/${resource.id || 'unknown'}`
    );

    const currentChain = [...context.referenceChain, resourceId];

    const references = extractReferencesToValidate(resource, resourceId, context.currentDepth);
    const filteredReferences = filterReferences(references, context);

    for (const ref of filteredReferences) {
      const shouldContinue = await this.processReference(
        ref,
        resource,
        context,
        currentChain,
        result,
        resourceFetcher,
      );
      if (!shouldContinue) return;
    }
  }

  private async processReference(
    ref: ReferenceToValidate,
    resource: any,
    context: RecursiveValidationContext,
    currentChain: string[],
    result: RecursiveValidationResult,
    resourceFetcher?: (reference: string) => Promise<any>,
  ): Promise<boolean> {
    if (isTimeoutReached(context)) {
      result.timedOut = true;
      return false;
    }

    const refIdentifier = ref.resourceType && ref.resourceId
      ? `${ref.resourceType}/${ref.resourceId}`
      : ref.reference;

    if (this.circularDetector.wouldCreateCircularReference(currentChain, refIdentifier)) {
      if (isEnclosingBundleProvenanceTarget(resource, ref, refIdentifier, currentChain)) {
        return true;
      }

      logger.warn(`[RecursiveReferenceValidator] Circular reference detected: ${refIdentifier}`);
      result.circularReferences.push([...currentChain, refIdentifier]);
      return true;
    }

    if (ref.reference.startsWith('#')) {
      if (ref.reference === '#') return true;
      const referencedResource = resolveContainedReference(resource, ref.reference);
      await this.validateResolvedReference(ref, referencedResource, context, currentChain, result, resourceFetcher);
      return true;
    }

    const bundleReferencedResource = resolveBundleReference(resource, ref.reference);
    if (bundleReferencedResource) {
      await this.validateResolvedReference(ref, bundleReferencedResource, context, currentChain, result, resourceFetcher);
      return true;
    }

    await this.fetchAndValidateReference(ref, context, currentChain, result, resourceFetcher);
    return true;
  }

  private async validateResolvedReference(
    ref: ReferenceToValidate,
    referencedResource: any | null,
    context: RecursiveValidationContext,
    currentChain: string[],
    result: RecursiveValidationResult,
    resourceFetcher?: (reference: string) => Promise<any>,
  ): Promise<void> {
    if (!referencedResource) {
      result.unresolvedReferences.push(ref.reference);
      return;
    }

    result.referencesFollowed++;
    await this.validateResourceRecursively(
      referencedResource,
      this.createChildContext(context, currentChain),
      result,
      resourceFetcher,
    );
  }

  private async fetchAndValidateReference(
    ref: ReferenceToValidate,
    context: RecursiveValidationContext,
    currentChain: string[],
    result: RecursiveValidationResult,
    resourceFetcher?: (reference: string) => Promise<any>,
  ): Promise<void> {
    if (!resourceFetcher) {
      result.unresolvedReferences.push(ref.reference);
      return;
    }

    try {
      const referencedResource = await resourceFetcher(ref.reference);
      await this.validateResolvedReference(ref, referencedResource, context, currentChain, result, resourceFetcher);
    } catch (error) {
      logger.error(`[RecursiveReferenceValidator] Failed to fetch ${ref.reference}:`, error);
      result.unresolvedReferences.push(ref.reference);
    }
  }

  private createChildContext(
    context: RecursiveValidationContext,
    currentChain: string[],
  ): RecursiveValidationContext {
    return {
      ...context,
      currentDepth: context.currentDepth + 1,
      referenceChain: currentChain,
    };
  }

  estimateValidationCost(
    resource: any,
    config: Partial<RecursiveValidationConfig> = {}
  ): {
    estimatedResources: number;
    estimatedReferences: number;
    estimatedTimeMs: number;
    wouldExceedLimits: boolean;
  } {
    const fullConfig: RecursiveValidationConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const references = extractReferencesToValidate(resource, 'root', 0);
    const estimatedResources = Math.min(
      references.length * fullConfig.maxDepth,
      100
    );

    return {
      estimatedResources,
      estimatedReferences: references.length,
      estimatedTimeMs: estimatedResources * 100,
      wouldExceedLimits: estimatedResources > 50 || references.length > 20,
    };
  }

  getDefaultConfig(): RecursiveValidationConfig {
    return { ...this.defaultConfig };
  }

  createSafeConfig(config: Partial<RecursiveValidationConfig>): RecursiveValidationConfig {
    const safeConfig: RecursiveValidationConfig = {
      ...this.defaultConfig,
      ...config,
    };

    safeConfig.maxDepth = Math.min(Math.max(safeConfig.maxDepth, 0), 3);
    safeConfig.maxReferencesPerResource = Math.min(safeConfig.maxReferencesPerResource || 10, 20);
    safeConfig.timeoutMs = Math.min(safeConfig.timeoutMs || 30000, 60000);

    return safeConfig;
  }
}

function isEnclosingBundleProvenanceTarget(
  resource: any,
  ref: ReferenceToValidate,
  refIdentifier: string,
  currentChain: string[],
): boolean {
  if (resource?.resourceType !== 'Bundle') return false;
  if (refIdentifier !== currentChain[currentChain.length - 1]) return false;

  const match = /^entry\[(\d+)\]\.resource\.target\[\d+\]$/.exec(ref.fieldPath);
  if (!match) return false;

  const entryIndex = Number(match[1]);
  const entryResource = resource.entry?.[entryIndex]?.resource;
  return entryResource?.resourceType === 'Provenance';
}

let validatorInstance: RecursiveReferenceValidator | null = null;

export function getRecursiveReferenceValidator(): RecursiveReferenceValidator {
  if (!validatorInstance) {
    validatorInstance = new RecursiveReferenceValidator();
  }
  return validatorInstance;
}

export function resetRecursiveReferenceValidator(): void {
  validatorInstance = null;
}
