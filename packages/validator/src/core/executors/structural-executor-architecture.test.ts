import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core/executors', file),
    'utf8',
  );
}

describe('structural executor architecture', () => {
  it('keeps execution state behind the structural validation pipeline', () => {
    const executor = readSource('structural-executor.ts');
    const pipeline = readSource('structural-validation-pipeline.ts');

    expect(executor).toContain("from './structural-validation-pipeline'");
    expect(executor).toContain('createStructuralValidatorComponents');
    expect(executor).toContain('createExecutorFailureIssue');
    expect(executor).not.toMatch(
      /validateStructuralSnapshot|detectUnknownProperties|BoundedLruCache|validateResourceSanity/,
    );

    expect(pipeline).toContain('validateStructuralSnapshot');
    expect(pipeline).toContain('detectUnknownProperties');
    expect(pipeline).toContain('BoundedLruCache');
    expect(pipeline).toContain('validateResourceSanity');
    expect(pipeline).not.toMatch(/createExecutorFailureIssue|\blogger\b/);
  });
});
