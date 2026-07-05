export interface FHIRPathExpressionCacheStats {
  hits: number;
  misses: number;
  compileErrors: number;
  hitRate: string;
  size: number;
}

type CacheEntry<T> =
  | { kind: 'compiled'; compiled: T }
  | { kind: 'error'; error: Error };

export interface VersionedExpressionCacheOptions<T> {
  maxSize: number;
  keySeparator?: string;
  compile: (expression: string, fhirVersion: 'R4' | 'R5' | 'R6') => T;
  onCompileError?: (expression: string, error: Error) => void;
  errorValue?: (error: Error) => T;
}

export class VersionedExpressionCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private hits = 0;
  private misses = 0;
  private compileErrors = 0;
  private readonly keySeparator: string;

  constructor(private readonly options: VersionedExpressionCacheOptions<T>) {
    this.keySeparator = options.keySeparator ?? '|';
  }

  getOrCompile(expression: string, fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'): T {
    const cacheKey = `${fhirVersion}${this.keySeparator}${expression}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.hits++;
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      if (cached.kind === 'error') throw cached.error;
      return cached.compiled;
    }

    this.misses++;
    try {
      const compiled = this.options.compile(expression, fhirVersion);
      this.set(cacheKey, { kind: 'compiled', compiled });
      return compiled;
    } catch (error) {
      this.compileErrors++;
      const cachedError = error instanceof Error ? error : new Error(String(error));
      this.options.onCompileError?.(expression, cachedError);

      if (this.options.errorValue) {
        const compiled = this.options.errorValue(cachedError);
        this.set(cacheKey, { kind: 'compiled', compiled });
        return compiled;
      }

      this.set(cacheKey, { kind: 'error', error: cachedError });
      throw cachedError;
    }
  }

  getStats(): FHIRPathExpressionCacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%';
    return {
      hits: this.hits,
      misses: this.misses,
      compileErrors: this.compileErrors,
      hitRate,
      size: this.cache.size,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.compileErrors = 0;
  }

  private set(cacheKey: string, entry: CacheEntry<T>): void {
    if (this.cache.size >= this.options.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, entry);
  }
}
