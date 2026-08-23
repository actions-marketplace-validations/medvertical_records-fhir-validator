import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(resolve(
    process.cwd(),
    'packages/validator/src/validators',
    file,
  ), 'utf8');
}

describe('ValueSetValidator architecture', () => {
  it('delegates lifecycle and validation execution to dedicated modules', () => {
    const facade = source('valueset-validator.ts');

    expect(facade).toContain("from './valueset-validator-runtime'");
    expect(facade).toContain("from './valueset-validation-pipeline'");
    expect(facade).toContain('new ValueSetValidatorRuntime(cache, operationCache)');
    expect(facade).toContain('new ValueSetValidationPipeline(');
    expect(facade).toContain('private async resolveCodeBinding(');
    expect(facade).not.toMatch(
      /EpochSingleflight|createEmptyTerminologyDiagnostics|mergeTerminologyResolutionConfig/,
    );
    expect(facade).not.toMatch(
      /clearValueSetValidatorCaches|registerExternalTerminologyResourceInCache/,
    );
    expect(facade).not.toMatch(
      /validateBindingFlow|validateValueSetMembership|resolveValueSetCodeBinding|expandValueSet/,
    );
  });

  it('keeps validation use cases out of the lifecycle runtime', () => {
    const runtime = source('valueset-validator-runtime.ts');
    const state = source('valueset-runtime-state.ts');

    expect(runtime).toContain("from './valueset-runtime-state'");
    expect(runtime).toMatch(
      /clearValueSetValidatorCaches|registerExternalTerminologyResourceInCache/,
    );
    expect(runtime).not.toMatch(
      /EpochSingleflight|createEmptyTerminologyDiagnostics|mergeTerminologyResolutionConfig/,
    );
    expect(state).toMatch(
      /EpochSingleflight|createEmptyTerminologyDiagnostics|mergeTerminologyResolutionConfig/,
    );
    expect(state).not.toMatch(
      /clearValueSetValidatorCaches|registerExternalTerminologyResourceInCache/,
    );
    expect(runtime).toMatch(
      /ValueSetRuntimeState|createValueSetValidatorComponents/,
    );
    expect(runtime).not.toMatch(
      /validateBindingFlow|validateValueSetMembership|resolveValueSetCodeBinding|expandValueSet/,
    );
  });

  it('keeps validation use cases independent from mutable lifecycle rules', () => {
    const pipeline = source('valueset-validation-pipeline.ts');

    expect(pipeline).toMatch(
      /validateBindingFlow|validateValueSetMembership|resolveValueSetCodeBinding|expandValueSet/,
    );
    expect(pipeline).not.toMatch(
      /EpochSingleflight|createEmptyTerminologyDiagnostics|mergeTerminologyResolutionConfig/,
    );
    expect(pipeline).not.toMatch(
      /clearValueSetValidatorCaches|registerExternalTerminologyResourceInCache/,
    );
  });

  it('keeps direct membership server policy behind a dedicated boundary', () => {
    const membership = source('valueset-membership-validator.ts');
    const serverDelegation = source('valueset-membership-server-delegation.ts');

    expect(membership).toContain("from './valueset-membership-server-delegation'");
    expect(membership).not.toMatch(
      /valueset-server-routing|valueset-terminology-server-validation|valueset-delegation-policy/,
    );
    expect(serverDelegation).toMatch(
      /hasTerminologyServer|validateCodeViaTerminologyServerWithFilters|canDelegateCodeValidation/,
    );
    expect(serverDelegation).toContain("'server-validate-code'");
  });
});
