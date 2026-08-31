export class BoundedLruCache<Key, Value> {
  private readonly entries = new Map<Key, Value>();
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    this.maxEntries = Number.isFinite(maxEntries)
      ? Math.max(1, Math.trunc(maxEntries))
      : 1;
  }

  has(key: Key): boolean {
    return this.entries.has(key);
  }

  get(key: Key): Value | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: Key, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  delete(key: Key): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  keys(): IterableIterator<Key> {
    return this.entries.keys();
  }

  get size(): number {
    return this.entries.size;
  }
}
