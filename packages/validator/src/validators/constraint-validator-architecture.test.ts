import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('constraint validator architecture', () => {
  it('keeps target planning and traversal behind the validation pipeline', () => {
    const validator = readSource('constraint-validator.ts');
    const pipeline = readSource('constraint-validation-pipeline.ts');

    expect(validator).toContain("from './constraint-validation-pipeline'");
    expect(validator).not.toMatch(
      /getValidationTargets|targetMatchesSliceDefinition|buildUserInvocationTable|elementExistsInResource/,
    );
    expect(pipeline).toContain('class ConstraintValidationPipeline');
    expect(pipeline).toContain('getValidationTargets');
    expect(pipeline).toContain('targetMatchesSliceDefinition');
    expect(pipeline).toContain('buildUserInvocationTable');
    expect(pipeline).not.toMatch(
      /new ConstraintEvaluationEngine|new ValueSetCache|new ConstraintExpressionCache/,
    );
  });
});
