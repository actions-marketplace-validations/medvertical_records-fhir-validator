import { describe, expect, it, vi } from 'vitest';

import {
  FHIRPathTerminologyUnverifiedError,
  evaluateAsyncFHIRPathTerminology,
  rewriteFHIRPathTerminologyFunctions,
  type FHIRPathTerminologyResolver,
} from '../fhirpath-async-terminology';

function createResolver(
  membership: FHIRPathTerminologyResolver['resolveCodeMembership'],
  subsumption: FHIRPathTerminologyResolver['resolveSubsumption'] = vi.fn()
    .mockResolvedValue('unknown'),
): FHIRPathTerminologyResolver {
  return {
    resolveCodeMembership: membership,
    resolveSubsumption: subsumption,
  };
}

describe('asynchronous FHIRPath terminology', () => {
  it('rewrites terminology functions but leaves quoted content untouched', () => {
    expect(rewriteFHIRPathTerminologyFunctions(
      "code.memberOf('http://example.org/memberOf') and note = 'subsumes()'",
    )).toEqual({
      expression:
        "code.recordsAsyncMemberOf('http://example.org/memberOf') and note = 'subsumes()'",
      hasTerminologyFunction: true,
    });
  });

  it('resolves cold-cache memberOf calls through the scoped resolver', async () => {
    const membership = vi.fn().mockImplementation(async (code: string) =>
      code === 'accepted' ? 'valid' : 'invalid');
    const resolver = createResolver(membership);
    const valueSetUrl = 'http://example.org/fhir/ValueSet/cold-cache';

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: `code.memberOf('${valueSetUrl}') and active = true`,
      context: { code: 'accepted', active: true },
      rootResource: { resourceType: 'Observation' },
      fhirVersion: 'R4',
      resolver,
    })).resolves.toEqual([true]);

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: `code.memberOf('${valueSetUrl}') and active = true`,
      context: { code: 'rejected', active: true },
      rootResource: { resourceType: 'Observation' },
      fhirVersion: 'R4',
      resolver,
    })).resolves.toEqual([false]);

    expect(membership).toHaveBeenNthCalledWith(
      1,
      'accepted',
      undefined,
      valueSetUrl,
      'R4',
    );
  });

  it('resolves subsumes calls asynchronously and preserves unknown as unverified', async () => {
    const resolveSubsumption = vi.fn()
      .mockResolvedValueOnce('subsumes')
      .mockResolvedValueOnce('unknown');
    const resolver = createResolver(
      vi.fn().mockResolvedValue('unverified'),
      resolveSubsumption,
    );
    const context = {
      parent: { system: 'http://snomed.info/sct', code: '404684003' },
      child: { system: 'http://snomed.info/sct', code: '22298006' },
    };

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: 'parent.subsumes(child)',
      context,
      rootResource: { resourceType: 'Condition' },
      fhirVersion: 'R4',
      resolver,
    })).resolves.toEqual([true]);

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: 'parent.subsumes(child)',
      context,
      rootResource: { resourceType: 'Condition' },
      fhirVersion: 'R4',
      resolver,
    })).rejects.toBeInstanceOf(FHIRPathTerminologyUnverifiedError);
  });

  it('does not turn an unavailable terminology result into a clinical failure', async () => {
    const resolver = createResolver(vi.fn().mockResolvedValue('unverified'));

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: "code.memberOf('http://example.org/fhir/ValueSet/unavailable')",
      context: { code: 'sensitive-code' },
      rootResource: { resourceType: 'Observation' },
      fhirVersion: 'R4',
      resolver,
    })).rejects.toBeInstanceOf(FHIRPathTerminologyUnverifiedError);
  });

  it('preserves other scoped FHIRPath functions in mixed terminology expressions', async () => {
    const membership = vi.fn().mockResolvedValue('valid');
    const resolver = createResolver(membership);

    await expect(evaluateAsyncFHIRPathTerminology({
      expression: "selectedCode().memberOf('http://example.org/fhir/ValueSet/mixed')",
      context: { resourceType: 'Observation' },
      rootResource: { resourceType: 'Observation' },
      fhirVersion: 'R4',
      resolver,
      userInvocationTable: {
        selectedCode: {
          fn: () => ['accepted'],
          arity: { 0: [] },
        },
      },
    })).resolves.toEqual([true]);

    expect(membership).toHaveBeenCalledWith(
      'accepted',
      undefined,
      'http://example.org/fhir/ValueSet/mixed',
      'R4',
    );
  });
});
