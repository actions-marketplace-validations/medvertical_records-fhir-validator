import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('SD FHIRPath executor architecture', () => {
  it('keeps constraint execution behind the runner boundary', () => {
    const executor = readSource('sd-fhirpath-executor.ts');
    const runner = readSource('sd-fhirpath-constraint-runner.ts');

    expect(executor).toMatch(/from ['"]\.\/sd-fhirpath-constraint-runner['"]/);
    expect(executor).toContain('createFHIRPathContext');
    expect(executor).toContain('createSDFHIRPathInvocationTable');
    expect(executor).toContain('SDElementMatcher');
    expect(executor).toContain('logger.debug');
    expect(executor).not.toMatch(
      /SDFHIRPathConstraintEvaluator|expressionStartsAtResourceRoot|rootExpressionConstraints/,
    );
    expect(executor).not.toMatch(/new SDConstraintCollector/);

    expect(runner).toContain('SDConstraintCollector');
    expect(runner).toContain('SDFHIRPathConstraintEvaluator');
    expect(runner).toContain('expressionStartsAtResourceRoot');
    expect(runner).toContain('rootExpressionConstraints');
    expect(runner).not.toMatch(
      /createFHIRPathContext|createSDFHIRPathInvocationTable|SDElementMatcher|logger/,
    );
  });
});
