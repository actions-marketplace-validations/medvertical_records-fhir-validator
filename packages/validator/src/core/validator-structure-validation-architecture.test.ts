import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('structure validation architecture', () => {
  it('keeps profile execution separate from top-level structural orchestration', () => {
    const orchestrator = readSource('validator-structure-validation.ts');
    const profileValidation = readSource('structure-profile-validation.ts');

    expect(orchestrator).toContain("from './structure-profile-validation'");
    expect(orchestrator).not.toMatch(
      /loadProfileWithSnapshot|getIncompatibleProfileResourceType|validateChoiceTypeProperties/,
    );
    expect(orchestrator).toMatch(
      /validatePostStructureRules|validateBundleEntries|withIssuesSchemaVersion/,
    );

    expect(profileValidation).toMatch(
      /loadProfileWithSnapshot|getIncompatibleProfileResourceType|validateChoiceTypeProperties/,
    );
    expect(profileValidation).not.toMatch(
      /validatePostStructureRules|validateBundleEntries|withIssuesSchemaVersion/,
    );
  });
});
