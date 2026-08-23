import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('constraint evaluation engine architecture', () => {
  it('delegates deterministic preparation from the stateful runtime', () => {
    const engine = readSource('constraint-evaluation-engine.ts');
    const preparation = readSource('constraint-evaluation-preparation.ts');

    expect(engine).toMatch(/from ['"]\.\/constraint-evaluation-preparation['"]/);
    expect(engine).not.toMatch(
      /validateDom3Constraint|evaluateSpecialisedRootConstraint|preprocessTypeLiterals|resolveTypeLiteralContext/,
    );
    expect(preparation).toContain('prepareConstraintEvaluation');
    expect(preparation).toContain('validateDom3Constraint');
    expect(preparation).toContain('evaluateSpecialisedRootConstraint');
    expect(preparation).toContain('preprocessTypeLiterals');
    expect(preparation).not.toMatch(
      /ConstraintEvaluationPrecheckPipeline|evaluateConstraintFHIRPath|handleConstraintEvaluationFailure/,
    );
  });

  it('delegates operational failure policy from constraint orchestration', () => {
    const engine = readSource('constraint-evaluation-engine.ts');
    const failurePolicy = readSource('constraint-evaluation-failure.ts');

    expect(engine).toMatch(/from ['"]\.\/constraint-evaluation-failure['"]/);
    expect(engine).not.toMatch(
      /createConstraintEvaluationError|getEvaluationErrorMessage|validationFailureMetadata/,
    );
    expect(failurePolicy).toContain('handleConstraintEvaluationFailure');
    expect(failurePolicy).toContain('createConstraintEvaluationError');
    expect(failurePolicy).not.toMatch(
      /evaluateConstraintFHIRPath|evaluatePreparedExpression|interpretConstraintResult/,
    );
  });

  it('delegates result interpretation and issue mapping from orchestration', () => {
    const engine = readSource('constraint-evaluation-engine.ts');
    const outcomePolicy = readSource('constraint-evaluation-outcome.ts');

    expect(engine).toMatch(/from ['"]\.\/constraint-evaluation-outcome['"]/);
    expect(engine).not.toMatch(
      /from ['"]\.\.\/logger['"]|sensitiveValueMetadata|interpretConstraintResult|constraintOutcomeIssues|buildConstraintViolationIssue/,
    );
    expect(outcomePolicy).toContain('resolveEvaluatedConstraintOutcome');
    expect(outcomePolicy).toContain('resolveKnownConstraintOutcome');
    expect(outcomePolicy).not.toMatch(
      /evaluateConstraintFHIRPath|ConstraintEvaluationPrecheckPipeline|handleConstraintEvaluationFailure/,
    );
  });

  it('keeps MemberOf infrastructure behind the precheck boundary', () => {
    const prechecks = readSource('constraint-evaluation-precheck-pipeline.ts');
    const memberOf = readSource('constraint-memberof-prechecks.ts');

    expect(prechecks).toMatch(/from ['"]\.\/constraint-memberof-prechecks['"]/);
    expect(prechecks).not.toMatch(
      /evaluateSimpleMemberOfExists|evaluateTrailingMemberOf|evaluateOptionalMemberOfUnion|rewriteLegacyValueSetInExists|ValueSetPackageLoader/,
    );
    expect(memberOf).toMatch(
      /evaluateSimpleMemberOfExists|evaluateTrailingMemberOf|evaluateOptionalMemberOfUnion|rewriteLegacyValueSetInExists|ValueSetPackageLoader/,
    );
    expect(memberOf).not.toMatch(
      /appendHtmlChecksConstraintIssues|evaluateResolveExistsConstraint|constraintOutcomeIssues/,
    );
  });
});
