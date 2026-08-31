import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('Bundle validator architecture', () => {
  it('delegates stateless rules and failure policy from the resolver adapter', () => {
    const validator = readSource('bundle-validator.ts');
    const rules = readSource('bundle-validation-rules.ts');
    const failure = readSource('bundle-validation-failure.ts');

    expect(validator).toContain('validateBundleRules');
    expect(validator).toContain('handleBundleValidationFailure');
    expect(validator).not.toMatch(
      /validateBundleCrossEntryReferences|validateBundleReachability|validateBundleTypeRules|createValidationIssue|createSafeValidationFailureMessage/,
    );

    expect(rules).toContain('validateBundleCrossEntryReferences');
    expect(rules).toContain('validateBundleReachability');
    expect(rules).toContain('validateBundleTypeRules');
    expect(rules).not.toMatch(/class BundleValidator|from ['"]\.\.\/logger['"]/);

    expect(failure).toContain('bundle-validation-error');
    expect(failure).toContain('createSafeValidationFailureMessage');
    expect(failure).not.toMatch(/validateBundleCrossEntryReferences|validateBundleEntryResources/);
  });
});
