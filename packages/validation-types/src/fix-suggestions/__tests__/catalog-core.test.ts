import { describe, it, expect } from 'vitest';
import { getFixSuggestion, resolvePatch } from '../../fix-suggestions';

describe('fix-suggestion catalog (core)', () => {
  const newStructuralCodes = [
    'narrative-txt2-violation',
    'date-year-implausible',
    'attachment-no-content',
    'attachment-att1-violation',
    'string-whitespace-padding',
  ] as const;

  it.each(newStructuralCodes)('resolves a suggestion for %s', (code) => {
    const suggestion = getFixSuggestion(code);
    expect(suggestion).toBeDefined();
    expect(suggestion?.why).toBeTruthy();
    expect(suggestion?.fix).toBeTruthy();
  });

  it('resolves the att-1 patch template from issue details', () => {
    const suggestion = getFixSuggestion('attachment-att1-violation');
    expect(suggestion?.patch).toBeDefined();
    const resolved = resolvePatch(suggestion!.patch!, { fieldPath: 'DocumentReference.content[0].attachment' });
    expect(resolved).toEqual({
      action: 'add',
      path: 'DocumentReference.content[0].attachment.contentType',
      value: '(MIME type of the data, e.g. "application/pdf")',
    });
  });

  it('offers whitespace-padding guidance without a value-bearing patch', () => {
    const suggestion = getFixSuggestion('string-whitespace-padding');
    expect(suggestion?.fix).toBeDefined();
    // The finding carries no trimmed value on purpose — a padded name is
    // clinical content and both message and details are persisted — so there
    // is nothing for a replace patch to fill.
    expect(suggestion?.patch).toBeUndefined();
  });
});
