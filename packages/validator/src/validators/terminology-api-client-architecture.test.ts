import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/validators', file), 'utf8');
}

describe('terminology API client architecture', () => {
  it('delegates mutable request state to one runtime', () => {
    const client = readSource('terminology-api-client.ts');
    const runtime = readSource('terminology-api-client-runtime.ts');

    expect(client).toContain("from './terminology-api-client-runtime'");
    expect(client).toContain('this.runtime.valueSetOperationsContext()');
    expect(client).toContain('this.runtime.codeSystemValidationContext()');
    expect(client).toContain('this.runtime.subsumptionContext()');
    expect(client).toContain('executeRemoteValueSetExpansion');
    expect(client).toContain('validateCodeAgainstRemoteValueSet');
    expect(client).not.toMatch(
      /pendingValidateCodeRequests|RemoteCodeSystemValidationBudget|snapshotTerminologyConfig/,
    );
    expect(client).not.toMatch(/from ['"]\.\/terminology-valueset-(?:expand|validate-code)-request['"]/);

    expect(runtime).toContain('pendingValidateCodeRequests');
    expect(runtime).toContain('pendingSubsumesRequests');
    expect(runtime).toContain('pendingCodeSystemValidateCodeRequests');
    expect(runtime).toContain('snapshotTerminologyConfig');
    expect(runtime).not.toMatch(
      /executeRemoteValueSetExpansion|validateCodeAgainstRemoteValueSet|executeRemoteSubsumption/,
    );
  });

  it('delegates subsumption without owning its request orchestration', () => {
    const client = readSource('terminology-api-client.ts');

    expect(client).toContain('executeRemoteSubsumption');
    expect(client).not.toMatch(/from ['"]\.\/terminology-subsumes-request['"]/);
  });

  it('keeps the stateless operations module independent from the public client', () => {
    const operations = [
      readSource('terminology-valueset-operations.ts'),
      readSource('terminology-valueset-validation-operation.ts'),
      readSource('terminology-subsumption-operation.ts'),
    ];

    for (const operation of operations) {
      expect(operation).not.toMatch(/from ['"]\.\/terminology-api-client['"]/);
      expect(operation).not.toMatch(/\bclass\s+/);
    }
  });

  it('keeps validate-code orchestration behind its operation boundary', () => {
    const valueSetOperations = readSource('terminology-valueset-operations.ts');
    const validationOperation = readSource('terminology-valueset-validation-operation.ts');

    expect(valueSetOperations).toMatch(
      /from ['"]\.\/terminology-valueset-validation-operation['"]/,
    );
    expect(valueSetOperations).not.toMatch(
      /runSingleFlight|makeValidateCodeCacheKey|executeValueSetValidateCodeRequest|canDelegateCodeValidation/,
    );
    expect(validationOperation).toMatch(
      /runSingleFlight|makeValidateCodeCacheKey|executeValueSetValidateCodeRequest|canDelegateCodeValidation/,
    );
    expect(validationOperation).not.toMatch(
      /expandValueSetViaTerminologyServer|canDelegateValueSetExpansion/,
    );
  });
});
