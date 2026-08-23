import type { TerminologyResolutionConfig } from './valueset-types';

export function canDelegateValueSetExpansion(config: TerminologyResolutionConfig): boolean {
  return config.serverDelegation?.expandValueSets !== false;
}

export function canDelegateCodeValidation(config: TerminologyResolutionConfig): boolean {
  return config.serverDelegation?.validateCodes !== false;
}
