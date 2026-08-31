export function makeCodeSystemValidateCodeCacheKey(
  serverUrl: string,
  system: string,
  code: string,
  display?: string,
  codeSystemVersion?: string,
  authoritativeSnomedEdition = false,
): string {
  return `${serverUrl}|${system}|${codeSystemVersion ?? ''}|${code}|${display ?? ''}`
    + `|snomed-authority:${authoritativeSnomedEdition ? 'yes' : 'no'}`;
}
