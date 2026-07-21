import type { AxiosInstance } from 'axios';
import { parseReference, type ReferenceParseResult } from './reference-type-extractor';
import { extractReferencesFromBundle, extractReferencesFromResource } from './reference-extraction';
import { asSummaryUrl, buildReferenceProbeUrl, extractUrlHost } from './reference-probe-url';
import { ReferenceCircuitBreaker } from './reference-circuit-breaker';
import {
  createReferenceHttpClient,
  resolveBatchCheckConfig,
  type BatchCheckConfig,
  type ResolvedBatchCheckConfig,
} from './reference-http-client';
import { ReferenceCheckCache } from './reference-check-cache';
import { summarizeReferenceBatch } from './reference-batch-result';
import { logger } from '../logger';

export type { BatchCheckConfig } from './reference-http-client';

export interface ReferenceExistenceCheck {
  reference: string;
  parseResult: ReferenceParseResult;
  exists: boolean;
  statusCode?: number;
  errorMessage?: string;
  responseTimeMs?: number;
  fromCache?: boolean;
}

export interface BatchCheckResult {
  results: ReferenceExistenceCheck[];
  existCount: number;
  notExistCount: number;
  failedCount: number;
  cacheHitCount: number;
  totalTimeMs: number;
  averageResponseTimeMs: number;
}

export class BatchedReferenceChecker {
  private cache = new ReferenceCheckCache();
  private httpClient: AxiosInstance;
  private config: ResolvedBatchCheckConfig;
  private pendingChecks: Map<string, Promise<ReferenceExistenceCheck>> = new Map();

  private circuitBreaker = new ReferenceCircuitBreaker();

  constructor(config?: Partial<BatchCheckConfig>) {
    this.config = resolveBatchCheckConfig(config);

    logger.info('[BatchedReferenceChecker] Task 10.9: Initialized with optimized config:', {
      maxConcurrent: this.config.maxConcurrent,
      timeoutMs: this.config.timeoutMs,
      cacheTtlMs: `${this.config.cacheTtlMs / 1000 / 60}min`,
    });

    this.httpClient = createReferenceHttpClient(this.config);
  }

  async checkBatch(
    references: string[],
    config?: Partial<BatchCheckConfig>
  ): Promise<BatchCheckResult> {
    const fullConfig = { ...this.config, ...config };
    const startTime = Date.now();

    logger.info(`[BatchedReferenceChecker] Checking ${references.length} references (max concurrent: ${fullConfig.maxConcurrent})`);

    const parsedRefs = references.map(ref => ({
      reference: ref,
      parseResult: parseReference(ref),
    }));

    const uncachedRefs: typeof parsedRefs = [];
    const results: ReferenceExistenceCheck[] = [];
    let cacheHits = 0;

    for (const ref of parsedRefs) {
      if (fullConfig.enableCache) {
        const cached = this.cache.get(ref.reference, fullConfig.cacheTtlMs);
        if (cached) {
          results.push({
            reference: ref.reference,
            parseResult: ref.parseResult,
            exists: cached.exists,
            statusCode: cached.statusCode,
            fromCache: true,
            responseTimeMs: 0,
          });
          cacheHits++;
          continue;
        }
      }
      uncachedRefs.push(ref);
    }

    logger.info(`[BatchedReferenceChecker] ${cacheHits} cache hits, ${uncachedRefs.length} uncached`);

    const uncachedResults = await this.checkReferencesInParallel(
      uncachedRefs,
      fullConfig
    );

    results.push(...uncachedResults);

    const summary = summarizeReferenceBatch(results, cacheHits, startTime);

    logger.info(
      `[BatchedReferenceChecker] Complete: ${summary.existCount} exist, ${summary.notExistCount} not found, ` +
      `${summary.failedCount} failed, ${summary.cacheHitCount} cached (${summary.totalTimeMs}ms)`
    );

    return {
      results,
      ...summary,
    };
  }

  private async checkReferencesInParallel(
    refs: Array<{ reference: string; parseResult: ReferenceParseResult }>,
    config: Required<BatchCheckConfig>
  ): Promise<ReferenceExistenceCheck[]> {
    const results: ReferenceExistenceCheck[] = [];
    const maxConcurrent = config.maxConcurrent;

    for (let i = 0; i < refs.length; i += maxConcurrent) {
      const chunk = refs.slice(i, i + maxConcurrent);

      const chunkResults = await Promise.all(
        chunk.map(ref => this.checkWithDeduplication(ref.reference, ref.parseResult, config))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private async checkWithDeduplication(
    reference: string,
    parseResult: ReferenceParseResult,
    config: Required<BatchCheckConfig>
  ): Promise<ReferenceExistenceCheck> {
    let pendingCheck = this.pendingChecks.get(reference);

    if (!pendingCheck) {
      pendingCheck = this.checkSingleReference(reference, parseResult, config)
        .finally(() => {
          this.pendingChecks.delete(reference);
        });

      this.pendingChecks.set(reference, pendingCheck);
    } else {
      logger.info(`[BatchedReferenceChecker] Task 10.9: Reusing in-flight check for ${reference}`);
    }

    return pendingCheck;
  }

  private async checkSingleReference(
    reference: string,
    parseResult: ReferenceParseResult,
    config: Required<BatchCheckConfig>
  ): Promise<ReferenceExistenceCheck> {
    const startTime = Date.now();

    const url = buildReferenceProbeUrl(reference, parseResult, config);
    if (!url) {
      return {
        reference,
        parseResult,
        exists: false,
        errorMessage: 'Cannot build URL for reference',
      };
    }

    const host = extractUrlHost(url);

    if (host && this.circuitBreaker.isOpen(host)) {
      return {
        reference,
        parseResult,
        exists: false,
        errorMessage: `Circuit breaker open for ${host} (degraded mode)`,
        responseTimeMs: Date.now() - startTime,
        fromCache: false,
      };
    }

    const useHead = this.circuitBreaker.supportsHead(host);

    try {
      const response = useHead
        ? await this.httpClient.head(url)
        : await this.httpClient.get(asSummaryUrl(url));
      let finalResponse = response;
      const responseTime = Date.now() - startTime;

      if (useHead && finalResponse.status === 405) {
        this.circuitBreaker.markHeadUnsupported(host);
        finalResponse = await this.httpClient.get(asSummaryUrl(url));
      }

      const exists =
        finalResponse.status >= 200 && finalResponse.status < 400;
      const isServerReachable = finalResponse.status < 500;

      if (isServerReachable && host) {
        this.circuitBreaker.recordSuccess(host);
      } else if (!isServerReachable && host) {
        this.circuitBreaker.recordFailure(host);
      }

      if (config.enableCache) {
        this.cache.set(reference, exists, finalResponse.status);
      }

      return {
        reference,
        parseResult,
        exists,
        statusCode: finalResponse.status,
        responseTimeMs: responseTime,
        fromCache: false,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (host) this.circuitBreaker.recordFailure(host);

      return {
        reference,
        parseResult,
        exists: false,
        errorMessage,
        responseTimeMs: responseTime,
        fromCache: false,
      };
    }
  }

  public resetCircuits(): void {
    this.circuitBreaker.reset();
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('[BatchedReferenceChecker] Cache cleared');
  }

  getCacheStats(): {
    size: number;
    entries: Array<{ reference: string; exists: boolean; age: number }>;
  } {
    return this.cache.getStats();
  }

  extractReferences(resource: any): string[] {
    return extractReferencesFromResource(resource);
  }

  async checkResourceReferences(
    resource: any,
    config?: Partial<BatchCheckConfig>
  ): Promise<BatchCheckResult> {
    const references = this.extractReferences(resource);
    return this.checkBatch(references, config);
  }

  async checkBundleReferences(
    bundle: any,
    config?: Partial<BatchCheckConfig>
  ): Promise<BatchCheckResult> {
    return this.checkBatch(extractReferencesFromBundle(bundle), config);
  }

  async filterExistingReferences(
    references: string[],
    config?: Partial<BatchCheckConfig>
  ): Promise<string[]> {
    const result = await this.checkBatch(references, config);
    return result.results
      .filter(r => r.exists)
      .map(r => r.reference);
  }

  async filterNonExistingReferences(
    references: string[],
    config?: Partial<BatchCheckConfig>
  ): Promise<string[]> {
    const result = await this.checkBatch(references, config);
    return result.results
      .filter(r => !r.exists && !r.errorMessage)
      .map(r => r.reference);
  }

  async allReferencesExist(
    references: string[],
    config?: Partial<BatchCheckConfig>
  ): Promise<boolean> {
    const result = await this.checkBatch(references, config);
    return result.existCount === references.length && result.failedCount === 0;
  }

  getDeduplicationStats(): {
    pendingChecks: number;
    cacheSize: number;
    estimatedSavedRequests: number;
  } {
    return {
      pendingChecks: this.pendingChecks.size,
      cacheSize: this.cache.size,
      estimatedSavedRequests: this.pendingChecks.size,
    };
  }

  clearPendingChecks(): void {
    this.pendingChecks.clear();
  }

  getOptimizationConfig(): {
    maxConcurrent: number;
    timeoutMs: number;
    cacheTtlMs: number;
    keepAlive: boolean;
  } {
    return {
      maxConcurrent: this.config.maxConcurrent,
      timeoutMs: this.config.timeoutMs,
      cacheTtlMs: this.config.cacheTtlMs,
      keepAlive: true,
    };
  }

}

let checkerInstance: BatchedReferenceChecker | null = null;

export function getBatchedReferenceChecker(config?: Partial<BatchCheckConfig>): BatchedReferenceChecker {
  if (!checkerInstance) {
    checkerInstance = new BatchedReferenceChecker(config);
  }
  return checkerInstance;
}

export function resetBatchedReferenceChecker(): void {
  checkerInstance = null;
}
