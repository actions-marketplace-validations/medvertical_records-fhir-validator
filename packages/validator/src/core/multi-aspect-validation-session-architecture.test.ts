import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('multi-aspect validation session architecture', () => {
  it('keeps resource preparation behind one session boundary', () => {
    const session = readSource('multi-aspect-validation-session.ts');

    expect(session).toMatch(/new MultiAspectResourcePreparation\(/);
    expect(session).not.toMatch(/profileLoadCache|BundleReferenceIndexCache/);
    expect(session).not.toMatch(/resolveContextQuestionnaire|loadProfileOrBase/);
    expect(session).not.toMatch(/createProfileFallbackIssue|createValidationErrorIssue/);
  });

  it('keeps preparation independent from session orchestration', () => {
    const preparation = readSource('multi-aspect-resource-preparation.ts');

    expect(preparation).toMatch(/profileLoadCache/);
    expect(preparation).toMatch(/BundleReferenceIndexCache/);
    expect(preparation).toMatch(/resolveContextQuestionnaire/);
    expect(preparation).not.toMatch(/from ['"]\.\/multi-aspect-validation-session['"]/);
  });

  it('keeps settings-derived execution and result policy behind one boundary', () => {
    const session = readSource('multi-aspect-validation-session.ts');
    const policy = readSource('multi-aspect-session-policy.ts');

    expect(session).toContain('new MultiAspectSessionPolicy(');
    expect(session).not.toMatch(
      /applyAdvisorRules|applyStrictnessSeverity|applyPublicationEscalation|normalizeIssuesByAspect|createMultiAspectRunner/,
    );
    expect(policy).toContain('class MultiAspectSessionPolicy');
    expect(policy).toContain('applyAdvisorRules');
    expect(policy).toContain('applyStrictnessSeverity');
    expect(policy).toContain('normalizeIssuesByAspect');
    expect(policy).not.toMatch(/MultiAspectResourcePreparation|executeSelectedAspects/);
  });
});
