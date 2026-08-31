import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MetadataExecutor architecture', () => {
  it('delegates meta field rules to the shared rule set', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/validator/src/core/executors/metadata-executor.ts'),
      'utf8',
    );

    expect(source).toMatch(
      /from ['"]\.\.\/\.\.\/metadata\/metadata-field-rule-set['"]/,
    );
    expect(source).toContain('new MetadataFieldRuleSet()');
    expect(source).not.toMatch(
      /\b(?:LastUpdatedValidator|VersionIdValidator|SourceValidator|ProfileValidator|SecurityValidator|TagValidator)\b/,
    );
  });
});
