import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('bundle entry validation output architecture', () => {
  it('keeps issue filtering, deduplication, and path rewriting behind one boundary', () => {
    const output = readSource('bundle-entry-validation-output.ts');

    for (const consumer of [
      'validator-bundle-entry-validation.ts',
      'multi-aspect-bundle-entry-validation.ts',
    ]) {
      const source = readSource(consumer);
      expect(source).toContain("from './bundle-entry-validation-output'");
      expect(source).not.toMatch(
        /shouldSuppressBundleEntryIssue|function dedupeEntryIssues|function rewriteEntryPath/,
      );
    }

    expect(output).toMatch(
      /shouldSuppressBundleEntryIssue|function dedupeEntryIssues|function rewriteEntryPath/,
    );
  });
});
