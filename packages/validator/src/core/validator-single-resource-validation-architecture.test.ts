import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('single-resource validation architecture', () => {
  it('keeps the public error boundary separate from resource execution', () => {
    const facade = readSource('validator-single-resource-validation.ts');
    const pipeline = readSource('validator-single-resource-pipeline.ts');

    expect(facade).toContain("from './validator-single-resource-pipeline'");
    expect(facade).toContain('validationFailureMetadata');
    expect(facade).toContain('createSafeValidationFailureMessage');
    expect(facade).toContain('withIssuesSchemaVersion');
    expect(facade).not.toMatch(
      /loadProfileOrBase|collectSingleResourceValidationIssues|dedupeResourceTreeIssues|resolveContextQuestionnaire/,
    );

    expect(pipeline).toContain('prepareSingleResourceProfile');
    expect(pipeline).toContain('collectSingleResourceValidationIssues');
    expect(pipeline).toContain('dedupeResourceTreeIssues');
    expect(pipeline).not.toMatch(
      /loadProfileOrBase|resolveContextQuestionnaire|getPrimaryDeclaredProfile|matchCodeInferredProfile|profileCanonicalMetadata/,
    );
    expect(pipeline).not.toMatch(
      /withIssuesSchemaVersion|validationFailureMetadata|createSafeValidationFailureMessage/,
    );
  });

  it('keeps profile selection and fallback preparation behind one stage', () => {
    const preparation = readSource('single-resource-profile-preparation.ts');

    expect(preparation).toContain('prepareSingleResourceProfile');
    expect(preparation).toContain('loadProfileOrBase');
    expect(preparation).toContain('resolveContextQuestionnaire');
    expect(preparation).toContain('getPrimaryDeclaredProfile');
    expect(preparation).toContain('matchCodeInferredProfile');
    expect(preparation).toContain('createProfileFallbackIssue');
  });
});
