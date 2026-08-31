export class ReferenceFetchTimeoutError extends Error {
  constructor() {
    super('Reference fetch timed out');
    this.name = 'ReferenceFetchTimeoutError';
  }
}

export function fetchReferenceWithinDeadline(
  resourceFetcher: (reference: string) => Promise<unknown>,
  reference: string,
  startTime: number,
  timeoutMs: number,
): Promise<unknown> {
  const remainingMs = Math.max(1, timeoutMs - (Date.now() - startTime));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReferenceFetchTimeoutError()), remainingMs);
    resourceFetcher(reference).then(
      (resource) => {
        clearTimeout(timer);
        resolve(resource);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
