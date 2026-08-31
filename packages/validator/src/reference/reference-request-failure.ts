export interface ReferenceRequestFailure {
  message: string;
  metadata: {
    errorType: 'error' | 'non-error';
    errorCode?: string;
  };
}

const timeoutCodes = new Set(['ETIMEDOUT', 'ECONNABORTED', 'ABORT_ERR']);

/** Classify request failures without exposing exception messages or target URLs. */
export function classifyReferenceRequestFailure(error: unknown): ReferenceRequestFailure {
  const rawCode = error && typeof error === 'object'
    ? (error as { code?: unknown }).code
    : undefined;
  const errorCode = typeof rawCode === 'string' && /^[A-Z0-9_-]{1,64}$/.test(rawCode)
    ? rawCode
    : undefined;
  const message = timeoutCodes.has(errorCode ?? '')
    ? 'Reference target request timed out'
    : errorCode === 'ENOTFOUND'
      ? 'Reference target could not be resolved'
      : errorCode === 'ECONNREFUSED'
        ? 'Reference target refused the connection'
        : 'Reference target request failed';
  return {
    message,
    metadata: {
      errorType: error instanceof Error ? 'error' : 'non-error',
      ...(errorCode ? { errorCode } : {}),
    },
  };
}
