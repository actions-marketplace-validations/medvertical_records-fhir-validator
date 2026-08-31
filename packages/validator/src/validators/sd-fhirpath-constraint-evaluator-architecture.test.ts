import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('StructureDefinition FHIRPath evaluator architecture', () => {
  it('delegates operational failure policy from constraint execution', () => {
    const evaluator = readSource('sd-fhirpath-constraint-evaluator.ts');
    const failurePolicy = readSource('sd-fhirpath-evaluation-failure.ts');

    expect(evaluator).toContain("from './sd-fhirpath-evaluation-failure'");
    expect(evaluator).not.toMatch(
      /from ['"]\.\.\/logger|sensitiveValueMetadata|validationFailureMetadata|isUnsupportedAsyncFHIRPathError/,
    );
    expect(failurePolicy).toContain('handleSDFHIRPathEvaluationFailure');
    expect(failurePolicy).toContain('createConstraintEvaluationError');
    expect(failurePolicy).not.toMatch(
      /evaluateConstraintTarget|evaluateCompiledSDFHIRPath/,
    );
  });

  it('delegates executable FHIRPath and terminology dependencies to a runtime', () => {
    const evaluator = readSource('sd-fhirpath-constraint-evaluator.ts');
    const runtime = readSource('sd-fhirpath-expression-runtime.ts');

    expect(evaluator).toContain("from './sd-fhirpath-expression-runtime'");
    expect(evaluator).not.toMatch(
      /evaluateAsyncFHIRPathTerminology|evaluateCompiledSDFHIRPath|ValueSetPackageLoader|new RegExp/,
    );
    expect(runtime).toContain('class SDFHIRPathExpressionRuntime');
    expect(runtime).toContain('evaluateConstraintTarget');
    expect(runtime).toContain('evaluateAsyncFHIRPathTerminology');
    expect(runtime).toContain('evaluateCompiledSDFHIRPath');
  });

  it('delegates matched and collected target planning', () => {
    const evaluator = readSource('sd-fhirpath-constraint-evaluator.ts');
    const plans = readSource('sd-fhirpath-evaluation-plans.ts');
    const matchedPlans = readSource('sd-fhirpath-matched-evaluation-plan-builder.ts');
    const collectedPlans = readSource('sd-fhirpath-collected-evaluation-plan-builder.ts');

    expect(evaluator).toContain("from './sd-fhirpath-evaluation-plans'");
    expect(evaluator).not.toMatch(
      /preprocessTypeLiterals|resolveChoiceTypeCast|getCollectedConstraintTargets|ElementContextResolver/,
    );
    expect(plans).toContain('class SDFHIRPathEvaluationPlanFactory');
    expect(plans).not.toMatch(
      /preprocessTypeLiterals|resolveChoiceTypeCast|getCollectedConstraintTargets|ElementContextResolver/,
    );
    expect(matchedPlans).toMatch(
      /preprocessTypeLiterals|resolveChoiceTypeCast|deriveChoiceTypeFromConcretePath/,
    );
    expect(matchedPlans).not.toMatch(
      /getCollectedConstraintTargets|ElementContextResolver|evaluateSpecialisedRootConstraint/,
    );
    expect(collectedPlans).toMatch(
      /preprocessTypeLiterals|getCollectedConstraintTargets|ElementContextResolver|evaluateSpecialisedRootConstraint/,
    );
    expect(collectedPlans).not.toMatch(
      /resolveChoiceTypeCast|deriveChoiceTypeFromConcretePath/,
    );
  });
});
