import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core/executors', file),
    'utf8',
  );
}

describe('ProfileExecutor architecture', () => {
  it('delegates slice traversal and extension overlap policy', () => {
    const executor = readSource('profile-executor.ts');
    const slicing = readSource('profile-slicing-validation.ts');

    expect(executor).toContain("from './profile-slicing-validation'");
    expect(executor).not.toMatch(
      /resolveNestedSliceParentItems|resolveParentArrayItems|suppressDuplicateExtensionSliceMinimum/,
    );
    expect(slicing).toMatch(
      /resolveNestedSliceParentItems|resolveParentArrayItems|suppressDuplicateExtensionSliceMinimum/,
    );
    expect(slicing).not.toMatch(/GermanIdentifierValidator|ConstraintValidator/);
  });
});
