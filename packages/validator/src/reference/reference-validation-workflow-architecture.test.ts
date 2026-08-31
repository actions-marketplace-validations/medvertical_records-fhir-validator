import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/reference', file),
    'utf8',
  );
}

describe('reference validation workflow architecture', () => {
  it('separates direct validation from optional recursive runtime policy', () => {
    const workflow = readSource('reference-validation-workflow.ts');
    const runtime = readSource('reference-validation-runtime.ts');

    expect(workflow).toContain('new ReferenceValidationRuntime');
    expect(workflow).toMatch(
      /extractReferences|validateExtractedReferences|validateContainedReferenceIssues/,
    );
    expect(workflow).not.toMatch(
      /buildRecursiveReferenceIssues|buildReferencePathsByValue|parseReference/,
    );

    expect(runtime).toMatch(
      /buildRecursiveReferenceIssues|buildReferencePathsByValue|parseReference/,
    );
    expect(runtime).not.toMatch(
      /extractReferences|validateExtractedReferences|validateContainedReferenceIssues/,
    );
  });

  it('keeps the existing fetcher type available from the workflow module', () => {
    const workflow = readSource('reference-validation-workflow.ts');

    expect(workflow).toContain(
      "export type { ReferenceResourceFetcher } from './reference-validation-runtime'",
    );
  });
});
