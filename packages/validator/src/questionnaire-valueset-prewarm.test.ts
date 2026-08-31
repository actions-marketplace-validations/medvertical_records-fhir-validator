import { describe, expect, it, vi } from 'vitest';
import {
  collectQuestionnaireAnswerValueSets,
  prewarmQuestionnaireAnswerValueSets,
} from './questionnaire-valueset-prewarm';

describe('Questionnaire answer ValueSet prewarm', () => {
  it('collects nested URLs once and ignores malformed or cyclic items', () => {
    const nested: unknown[] = [
      null,
      42,
      {
        answerValueSet: 'https://example.test/ValueSet/nested',
      },
    ];
    const rootItems: unknown[] = [
      { answerValueSet: 'https://example.test/ValueSet/root' },
      { answerValueSet: 'https://example.test/ValueSet/root' },
      { item: nested },
    ];
    nested.push({ item: rootItems });

    expect(collectQuestionnaireAnswerValueSets({
      resourceType: 'Questionnaire',
      item: rootItems,
    })).toEqual([
      'https://example.test/ValueSet/root',
      'https://example.test/ValueSet/nested',
    ]);
  });

  it('uses an iterative walk for deeply nested Questionnaire items', () => {
    const root: Record<string, unknown> = {};
    let current = root;
    for (let index = 0; index < 5_000; index++) {
      const child: Record<string, unknown> = {};
      current.item = [child];
      current = child;
    }
    current.answerValueSet = 'https://example.test/ValueSet/deep';

    expect(collectQuestionnaireAnswerValueSets({ item: [root] })).toEqual([
      'https://example.test/ValueSet/deep',
    ]);
  });

  it('continues prewarming after one ValueSet loader failure', async () => {
    const hostile = {
      toString() {
        throw new Error('must not escape');
      },
    };
    const loadValueSet = vi.fn(async (url: string) => {
      if (url.endsWith('/first')) throw hostile;
      return { resourceType: 'ValueSet', url };
    });
    const questionnaire = {
      item: [
        { answerValueSet: 'https://example.test/ValueSet/first' },
        { answerValueSet: 'https://example.test/ValueSet/second' },
      ],
    };

    await expect(prewarmQuestionnaireAnswerValueSets(
      questionnaire,
      loadValueSet,
    )).resolves.toBeUndefined();
    expect(loadValueSet).toHaveBeenCalledTimes(2);
    expect(loadValueSet).toHaveBeenLastCalledWith(
      'https://example.test/ValueSet/second',
    );
  });
});
