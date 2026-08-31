export interface ProfileWarmupResult {
  warmedUp: number;
  timeMs: number;
}

/** Owns one validator graph's profile-warmup lifecycle and single-flight. */
export class ProfileWarmupCoordinator {
  private completed = false;
  private pending: Promise<ProfileWarmupResult> | null = null;
  private revision = 0;

  async runOnce(
    warmup: () => Promise<ProfileWarmupResult>,
  ): Promise<ProfileWarmupResult | null> {
    if (this.completed) return null;
    if (this.pending) return this.pending;

    const revision = this.revision;
    const pending = warmup();
    this.pending = pending;
    try {
      const result = await pending;
      if (this.revision === revision) this.completed = true;
      return result;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }

  reset(): void {
    this.revision += 1;
    this.completed = false;
  }
}
