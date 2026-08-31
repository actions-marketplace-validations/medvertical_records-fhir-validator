import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('slicing validator architecture', () => {
  it('delegates resolved matching while retaining mutable validator state', () => {
    const validator = readSource('slicing-validator.ts');
    const resolvedValidation = readSource('slicing-resolved-validation.ts');
    const validationLogging = readSource('slicing-validation-logging.ts');

    expect(validator).toContain('validateResolvedSlicing');
    expect(validator).toContain('logSlicingValidationStart');
    expect(validator).toContain('referenceResolver');
    expect(validator).toContain('typeProfileResolver');
    expect(validator).toContain('mustSupportSeverity');
    expect(validator).not.toMatch(
      /assessSlicingVerifiability|assignElementsToSlices|validateMatchedSlices|validateSlicingMatchSet|buildMissingDiscriminatorIssues|sensitiveValueMetadata|from ['"]\.\.\/logger['"]/,
    );

    expect(resolvedValidation).toContain('assessSlicingVerifiability');
    expect(resolvedValidation).toContain('assignElementsToSlices');
    expect(resolvedValidation).toContain('validateMatchedSlices');
    expect(resolvedValidation).toContain('validateSlicingMatchSet');
    expect(resolvedValidation).toContain('buildMissingDiscriminatorIssues');
    expect(resolvedValidation).not.toMatch(
      /class SlicingValidator|createIsolatedSlicingValueSetLoader|extractSlicingInfo|logger/,
    );

    expect(validationLogging).toContain('sensitiveValueMetadata');
    expect(validationLogging).toContain("logger.debug('[SlicingValidator] Validating sliced elements'");
  });

  it('delegates operational failure policy from matching orchestration', () => {
    const validator = readSource('slicing-validator.ts');
    const failurePolicy = readSource('slicing-validation-failure.ts');

    expect(validator).toMatch(/from ['"]\.\/slicing-validation-failure['"]/);
    expect(validator).not.toMatch(
      /createValidationIssue|resourceTypeFromPath|createSafeValidationFailureMessage|validationFailureMetadata/,
    );
    expect(failurePolicy).toContain('handleSlicingValidationFailure');
    expect(failurePolicy).toContain('profile-slice-validation-error');
    expect(failurePolicy).not.toMatch(
      /extractSlicingInfo|assignElementsToSlices|validateMatchedSlices|validateSlicingMatchSet/,
    );
  });
});
