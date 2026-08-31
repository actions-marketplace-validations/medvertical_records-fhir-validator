import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/validators', file),
    'utf8',
  );
}

describe('complex type validator architecture', () => {
  it('delegates sub-element policy while retaining recursive orchestration', () => {
    const validator = readSource('complex-type-validator.ts');
    const subElementValidation = readSource('complex-type-sub-element-validation.ts');

    expect(validator).toContain('validateComplexTypeSubElement');
    expect(validator).toContain('validateNested');
    expect(validator).not.toMatch(
      /createValidationIssue|getNestedValue|narrowChoiceTypeElement|parentComplexElementAbsent/,
    );
    expect(subElementValidation).toContain('validateComplexTypeSubElement');
    expect(subElementValidation).toContain('createValidationIssue');
    expect(subElementValidation).toContain('valueSetValidator.validateBinding');
    expect(subElementValidation).toContain("from '../core/fhir-resource'");
    expect(subElementValidation).not.toMatch(
      /ComplexTypeDefinitionResolver|resolveMatchingType|checkExtensionExt1|checkPeriodPer1/,
    );
  });
});
