export function makeSubsumesCacheKey(
  serverUrl: string,
  system: string,
  codeA: string,
  codeB: string,
): string {
  return `${serverUrl}|${system}|${codeA}|${codeB}`;
}
