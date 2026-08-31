interface ActiveOperation {
  force: boolean;
  shareable: boolean;
  promise: Promise<unknown>;
}

export class ForceAwareOperationLocks {
  private readonly active = new Map<string, ActiveOperation>();

  async run<T>(
    key: string,
    force: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    const pending = this.active.get(key);
    if (pending) {
      if (pending.shareable && (!force || pending.force)) {
        return pending.promise as Promise<T>;
      }
      await pending.promise.catch(() => undefined);
      if (this.active.get(key) === pending) this.active.delete(key);
      return this.run(key, force, operation);
    }

    const current: ActiveOperation = {
      force,
      shareable: true,
      promise: Promise.resolve().then(operation),
    };
    this.active.set(key, current);
    try {
      return await current.promise as T;
    } finally {
      if (this.active.get(key) === current) this.active.delete(key);
    }
  }

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.active.get(key);
    if (pending) {
      await pending.promise.catch(() => undefined);
      if (this.active.get(key) === pending) this.active.delete(key);
      return this.runExclusive(key, operation);
    }

    const current: ActiveOperation = {
      force: true,
      shareable: false,
      promise: Promise.resolve().then(operation),
    };
    this.active.set(key, current);
    try {
      return await current.promise as T;
    } finally {
      if (this.active.get(key) === current) this.active.delete(key);
    }
  }
}
