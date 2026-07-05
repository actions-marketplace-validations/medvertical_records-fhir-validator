import type { SubsumptionOutcome } from './terminology-api-types';

interface TimedCacheEntry<T> {
    result: T;
    cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;
const validateCodeCache = new Map<string, TimedCacheEntry<boolean>>();
const subsumesCache = new Map<string, TimedCacheEntry<Exclude<SubsumptionOutcome, 'unknown'>>>();
const codeSystemValidateCodeCache = new Map<string, TimedCacheEntry<unknown>>();
const valueSetNotResolvableCache = new Map<string, TimedCacheEntry<boolean>>();

function getFromTimedLruCache<T>(cache: Map<string, TimedCacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        cache.delete(key);
        return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.result;
}

function storeInTimedLruCache<T>(cache: Map<string, TimedCacheEntry<T>>, key: string, result: T): void {
    if (cache.size >= MAX_CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
    cache.set(key, { result, cachedAt: Date.now() });
}

export function makeValidateCodeCacheKey(
    serverUrl: string,
    system: string | undefined,
    code: string,
    valueSetUrl: string,
): string {
    return `${serverUrl}|${system ?? ''}|${code}|${valueSetUrl}`;
}

export function makeValueSetNotResolvableCacheKey(
    serverUrl: string,
    valueSetUrl: string,
): string {
    return `${serverUrl}|${valueSetUrl}`;
}

export function getFromValidateCodeCache(key: string): boolean | undefined {
    return getFromTimedLruCache(validateCodeCache, key);
}

export function getFromValueSetNotResolvableCache(key: string): boolean | undefined {
    return getFromTimedLruCache(valueSetNotResolvableCache, key);
}

export function storeInValidateCodeCache(key: string, result: boolean): void {
    storeInTimedLruCache(validateCodeCache, key, result);
}

export function storeInValueSetNotResolvableCache(key: string): void {
    storeInTimedLruCache(valueSetNotResolvableCache, key, true);
}

export function clearValidateCodeCache(): void {
    validateCodeCache.clear();
    valueSetNotResolvableCache.clear();
}

export function getValidateCodeCacheSize(): number {
    return validateCodeCache.size;
}

export function makeSubsumesCacheKey(serverUrl: string, system: string, codeA: string, codeB: string): string {
    return `${serverUrl}|${system}|${codeA}|${codeB}`;
}

export function getFromSubsumesCache(key: string): SubsumptionOutcome | undefined {
    return getFromTimedLruCache(subsumesCache, key);
}

export function storeInSubsumesCache(key: string, result: SubsumptionOutcome): void {
    if (result === 'unknown') return;
    storeInTimedLruCache(subsumesCache, key, result);
}

export function getCachedSubsumesOutcome(
    system: string,
    codeA: string,
    codeB: string,
    serverUrl?: string,
): SubsumptionOutcome | undefined {
    if (serverUrl) {
        return getFromSubsumesCache(makeSubsumesCacheKey(serverUrl, system, codeA, codeB));
    }

    const suffix = `|${system}|${codeA}|${codeB}`;
    for (const key of Array.from(subsumesCache.keys())) {
        if (!key.endsWith(suffix)) continue;
        const cached = getFromSubsumesCache(key);
        if (cached !== undefined) return cached;
    }

    return undefined;
}

export function clearSubsumesCache(): void {
    subsumesCache.clear();
}

export function getSubsumesCacheSize(): number {
    return subsumesCache.size;
}

export function makeCodeSystemValidateCodeCacheKey(
    serverUrl: string,
    system: string,
    code: string,
    display?: string,
): string {
    return `${serverUrl}|${system}|${code}|${display ?? ''}`;
}

export function getFromCodeSystemValidateCodeCache<T>(key: string): T | undefined {
    return getFromTimedLruCache(codeSystemValidateCodeCache, key) as T | undefined;
}

export function storeInCodeSystemValidateCodeCache(key: string, result: unknown): void {
    storeInTimedLruCache(codeSystemValidateCodeCache, key, result);
}

export function clearCodeSystemValidateCodeCache(): void {
    codeSystemValidateCodeCache.clear();
}
