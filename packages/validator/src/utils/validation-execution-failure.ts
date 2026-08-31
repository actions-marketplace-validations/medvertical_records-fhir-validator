const OPERATIONAL_FAILURE_SUFFIX =
  'could not be completed because the validator encountered an operational error.';

/**
 * Builds a user-visible validation failure message without exposing the
 * underlying exception. The operation label must be controlled by the caller
 * and must never contain resource data, URLs, credentials, or exception text.
 */
export function createSafeValidationFailureMessage(operation: string): string {
  return `${operation} ${OPERATIONAL_FAILURE_SUFFIX}`;
}

/**
 * Bounded diagnostics for logs and issue details. Exception messages and
 * stacks may contain credentials, local paths, URLs, or attacker-controlled
 * response bodies, so validation boundaries expose only a fixed category.
 */
export function validationFailureMetadata(error: unknown): {
  failureKind: 'abort' | 'range' | 'syntax' | 'type' | 'unknown';
  failureOrigin?: string;
} {
  const failureOrigin = safeFailureOrigin(error);
  if (error instanceof SyntaxError) return { failureKind: 'syntax', ...failureOrigin };
  if (error instanceof TypeError) return { failureKind: 'type', ...failureOrigin };
  if (error instanceof RangeError) return { failureKind: 'range', ...failureOrigin };
  if (
    error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'AbortError'
  ) {
    return { failureKind: 'abort', ...failureOrigin };
  }
  return { failureKind: 'unknown', ...failureOrigin };
}

/**
 * Preserve a code-owned stack location without logging exception messages,
 * absolute paths, URLs, credentials, or resource data.
 */
function safeFailureOrigin(error: unknown): { failureOrigin?: string } {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return {};

  for (const line of error.stack.split('\n').slice(1)) {
    const normalized = line.replaceAll('\\', '/');
    const match = normalized.match(
      /(?:packages\/validator\/src|server)\/([A-Za-z0-9_./-]+\.ts):(\d+)(?::\d+)?/,
    );
    if (match) {
      return { failureOrigin: `${match[1]}:${match[2]}` };
    }
  }
  return {};
}
