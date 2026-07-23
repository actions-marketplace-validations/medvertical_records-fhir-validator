/** Deduplicates identical asynchronous work within one mutable configuration epoch. */
export class EpochSingleflight<Result> {
  private epoch = 0;
  private readonly pending = new Map<string, Promise<Result>>();

  advanceEpoch(): void {
    this.epoch += 1;
  }

  clear(): void {
    this.pending.clear();
    this.advanceEpoch();
  }

  async run(keyParts: unknown[], resolve: () => Promise<Result>): Promise<Result> {
    const key = JSON.stringify([this.epoch, ...keyParts]);
    const current = this.pending.get(key);
    if (current) return current;
    const pending = resolve();
    this.pending.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.pending.get(key) === pending) this.pending.delete(key);
    }
  }
}
