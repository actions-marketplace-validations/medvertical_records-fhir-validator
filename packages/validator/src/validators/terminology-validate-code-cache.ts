import type { BindingStrength } from './valueset-display-utils';

export function makeValidateCodeCacheKey(
  serverUrl: string,
  system: string | undefined,
  code: string,
  valueSetUrl: string,
  bindingStrength: BindingStrength | undefined,
): string {
  return JSON.stringify([
    serverUrl,
    system ?? null,
    code,
    valueSetUrl,
    bindingStrength === 'required' ? 'required' : 'non-required',
  ]);
}

export function makeValueSetNotResolvableCacheKey(serverUrl: string, valueSetUrl: string): string {
  return `${serverUrl}|${valueSetUrl}`;
}
