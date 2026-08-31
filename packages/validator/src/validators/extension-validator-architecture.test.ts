import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/validators', file), 'utf8');
}

describe('extension validator architecture', () => {
  it('keeps the public class as the operational error boundary', () => {
    const validator = readSource('extension-validator.ts');

    expect(validator).toContain('new ExtensionValidationRuntime');
    expect(validator).toContain("result.status === 'completed'");
    expect(validator).toContain('profile-extension-validation-error');
    expect(validator).not.toContain('validateExtensionInstance');
    expect(validator).not.toContain('BoundedLruCache');
    expect(validator).not.toContain('walkResourceExtensions');
    expect(validator).not.toContain('validateProfileScopedExtensionInstances');
    expect(validator).not.toMatch(/from ['"]\.\/extension-profile-validation['"]/);
    expect(validator).not.toMatch(/from ['"]\.\/extension-structure-rules['"]/);
  });

  it('keeps the runtime stateful and independent from the public class', () => {
    const runtime = readSource('extension-validation-runtime.ts');
    const instanceValidation = readSource('extension-instance-validation.ts');

    expect(runtime).toContain('BoundedLruCache');
    expect(runtime).toContain('validateExtensionInstance');
    expect(runtime).toContain('walkResourceExtensions');
    expect(runtime).toContain('validateProfileScopedExtensionInstances');
    expect(runtime).not.toMatch(/from ['"]\.\/extension-validator['"]/);
    expect(instanceValidation).not.toMatch(/from ['"]\.\/extension-validator['"]/);
    expect(instanceValidation).not.toMatch(/\bclass\s+/);
  });

  it('separates local instance rules from nested extension traversal', () => {
    const instanceValidation = readSource('extension-instance-validation.ts');
    const instanceRules = readSource('extension-instance-rule-validation.ts');

    expect(instanceValidation).toContain('validateExtensionInstanceRules');
    expect(instanceValidation).toMatch(
      /validateNestedExtensions|getSubExtensionDefinitions|checkExtensionPathCardinality/,
    );
    expect(instanceValidation).not.toMatch(
      /validateAgainstExtensionProfile|validateExtensionValueElements|validateExtensionValueType/,
    );

    expect(instanceRules).toMatch(
      /validateAgainstExtensionProfile|validateExtensionValueElements|validateExtensionValueType/,
    );
    expect(instanceRules).not.toMatch(
      /validateNestedExtensions|getSubExtensionDefinitions|checkExtensionPathCardinality/,
    );
  });

  it('separates profile execution from nested-definition and value policies', () => {
    const profileValidation = readSource('extension-profile-validation.ts');
    const subdefinitionLoader = readSource('extension-subdefinition-loader.ts');
    const valueValidation = readSource('extension-value-profile-validation.ts');

    expect(profileValidation).toContain('validateAgainstExtensionProfile');
    expect(profileValidation).toContain('validateExtensionValueElements');
    expect(profileValidation).not.toMatch(
      /extractSubExtensionDefinitions|createValidationIssue|typeValidator\.validate\(/,
    );
    expect(subdefinitionLoader).toContain('getSubExtensionDefinitions');
    expect(subdefinitionLoader).toContain('extractSubExtensionDefinitions');
    expect(subdefinitionLoader).not.toMatch(/SDFHIRPathExecutor|validateExtensionValueElements/);
    expect(valueValidation).toContain('validateExtensionValueElements');
    expect(valueValidation).toContain('typeValidator.validate');
    expect(valueValidation).toContain('valueSetValidator.validateBinding');
    expect(valueValidation).not.toMatch(/loadProfile|SDFHIRPathExecutor/);
  });
});
