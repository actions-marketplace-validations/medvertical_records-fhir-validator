import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('validation issue dedupe architecture', () => {
  it('uses profile signals while collecting context and exact issue identity', () => {
    const consumers = [
      readSource('validation-issue-dedupe-context.ts'),
      readSource('validation-issue-dedupe.ts'),
    ].join('\n');

    expect(consumers).toContain("from './validation-issue-dedupe-profile-signals'");
    expect(consumers).not.toContain("from './validation-issue-dedupe-profile-suppressions'");
  });

  it('keeps signal detection independent from suppression decisions', () => {
    const signals = readSource('validation-issue-dedupe-profile-signals.ts');
    const suppressions = readSource('validation-issue-dedupe-profile-suppressions.ts');

    expect(signals).not.toContain('validation-issue-dedupe-profile-suppressions');
    expect(signals).not.toMatch(/export function isRedundant/);
    expect(suppressions).toContain("from './validation-issue-dedupe-profile-signals'");
    expect(suppressions).not.toMatch(
      /export function (?:getEffectiveRuleId|getSpecificConstraintKey|isStructuralDateTimeMissingTimezoneIssue|isSpecificNameInvariantIssue|isGermanGenderExtensionMissingIssue|isInvariantSpecificConstraintIssue)/,
    );
  });
});
