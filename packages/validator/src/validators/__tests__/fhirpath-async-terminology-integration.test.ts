import { describe, expect, it, vi } from 'vitest';

import type { StructureDefinition } from '../../core/structure-definition-types';
import { ConstraintValidator } from '../constraint-validator';
import type { FHIRPathTerminologyResolver } from '../fhirpath-async-terminology';
import { SDFHIRPathExecutor } from '../sd-fhirpath-executor';

const sdFHIRPathExecutor = new SDFHIRPathExecutor();

const VALUE_SET_URL = 'http://example.org/fhir/ValueSet/cold-cache-gender';

function createResolver(): FHIRPathTerminologyResolver {
  return {
    resolveCodeMembership: vi.fn().mockImplementation(async (code: string) =>
      code === 'female' ? 'valid' : 'invalid'),
    resolveSubsumption: vi.fn().mockResolvedValue('unknown'),
  };
}

describe('FHIRPath cold-cache terminology integration', () => {
  it('routes ConstraintValidator memberOf through the configured resolver', async () => {
    const resolver = createResolver();
    const validator = new ConstraintValidator(resolver);
    const elements = [{
      path: 'Patient',
      constraint: [{
        key: 'gender-cold-cache',
        severity: 'error' as const,
        human: 'Gender must be in the configured value set.',
        expression: `gender.memberOf('${VALUE_SET_URL}') and active = true`,
      }],
    }];

    await expect(validator.validate(
      { resourceType: 'Patient', gender: 'female', active: true },
      elements,
      'http://example.org/fhir/StructureDefinition/patient',
    )).resolves.toHaveLength(0);

    const rejected = await validator.validate(
      { resourceType: 'Patient', gender: 'rejected', active: true },
      elements,
      'http://example.org/fhir/StructureDefinition/patient',
    );

    expect(rejected).toEqual([
      expect.objectContaining({ ruleId: 'gender-cold-cache' }),
    ]);
    expect(resolver.resolveCodeMembership).toHaveBeenCalledWith(
      'female',
      undefined,
      VALUE_SET_URL,
      'R4',
    );
  });

  it('routes StructureDefinition constraints through the same resolver', async () => {
    const resolver = createResolver();
    const structureDef: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/patient',
      name: 'PatientColdCacheTerminology',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [{
          id: 'Patient',
          path: 'Patient',
          constraint: [{
            key: 'gender-cold-cache-sd',
            severity: 'error',
            human: 'Gender must be in the configured value set.',
            expression: `gender.memberOf('${VALUE_SET_URL}')`,
          }],
        }],
      },
    };

    await expect(sdFHIRPathExecutor.execute({
      resource: { resourceType: 'Patient', gender: 'female' },
      resourceType: 'Patient',
      structureDef,
      fhirVersion: 'R4',
      terminologyResolver: resolver,
    })).resolves.toHaveLength(0);

    const rejected = await sdFHIRPathExecutor.execute({
      resource: { resourceType: 'Patient', gender: 'rejected' },
      resourceType: 'Patient',
      structureDef,
      fhirVersion: 'R4',
      terminologyResolver: resolver,
    });

    expect(rejected).toEqual([
      expect.objectContaining({ ruleId: 'gender-cold-cache-sd' }),
    ]);
  });
});
