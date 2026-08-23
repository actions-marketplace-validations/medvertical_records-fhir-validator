import { describe, expect, it } from 'vitest';
import { TerminologyOperationCache } from './terminology-operation-cache';

describe('TerminologyOperationCache ownership', () => {
  it('does not share remote terminology results between validator graphs', () => {
    const first = new TerminologyOperationCache();
    const second = new TerminologyOperationCache();

    first.storeValidateCode('validate', true);
    first.storeCodeSystemValidateCode('code-system', { valid: false });
    first.storeSubsumes('subsumes', 'subsumes');

    expect(second.getValidateCode('validate')).toBeUndefined();
    expect(second.getCodeSystemValidateCode('code-system')).toBeUndefined();
    expect(second.getSubsumes('subsumes')).toBeUndefined();
  });

  it('clears all operation domains owned by the instance', () => {
    const cache = new TerminologyOperationCache();
    cache.storeValidateCode('validate', true);
    cache.storeValueSetNotResolvable('missing');
    cache.storeCodeSystemValidateCode('code-system', { valid: true });
    cache.storeSubsumes('subsumes', 'equivalent');

    cache.clear();

    expect(cache.getValidateCode('validate')).toBeUndefined();
    expect(cache.getValueSetNotResolvable('missing')).toBeUndefined();
    expect(cache.getCodeSystemValidateCode('code-system')).toBeUndefined();
    expect(cache.getSubsumes('subsumes')).toBeUndefined();
  });
});
