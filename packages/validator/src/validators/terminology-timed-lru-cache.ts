interface TimedCacheEntry<T> {
  result: T;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;

export class TerminologyTimedLruCache<T> {
  private readonly entries = new Map<string, TimedCacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  set(key: string, result: T): void {
    if (this.entries.size >= MAX_CACHE_SIZE) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, { result, cachedAt: Date.now() });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}
