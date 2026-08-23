export function getErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'Unknown error';
  }
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error));
}
