export function makeCodeSystemValidateCodeCacheKey(
  serverUrl: string,
  system: string,
  code: string,
  display?: string,
): string {
  return `${serverUrl}|${system}|${code}|${display ?? ''}`;
}
