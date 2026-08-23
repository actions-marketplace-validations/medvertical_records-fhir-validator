import { describe, expect, it } from 'vitest';
import type { StructureDefinition } from '../core/structure-definition-types';
import { SDFHIRPathExecutor } from './sd-fhirpath-executor';
import { ValueSetCache } from './valueset-cache';

const valueSetUrl = 'https://example.test/fhir/ValueSet/marital-status';
const valueSetCache = new ValueSetCache();
valueSetCache.setValueSetFile(`${valueSetUrl}|R4`, {
  resourceType: 'ValueSet',
  url: valueSetUrl,
  status: 'active',
  compose: {
    include: [{
      system: 'https://example.test/fhir/CodeSystem/marital',
      concept: [{ code: 'M' }],
    }],
  },
});
const sdFHIRPathExecutor = new SDFHIRPathExecutor(valueSetCache);

const profile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'https://example.test/fhir/StructureDefinition/MemberOfPatient',
  name: 'MemberOfPatient',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'Patient',
  snapshot: {
    element: [
      { id: 'Patient', path: 'Patient' },
      {
        id: 'Patient.maritalStatus',
        path: 'Patient.maritalStatus',
        type: [{ code: 'CodeableConcept' }],
        constraint: [{
          key: 'marital-memberof',
          severity: 'error',
          human: 'Marital status must use the configured value set',
          expression: `where(coding.memberOf('${valueSetUrl}')).exists()`,
        }],
      },
    ],
  },
};

describe('SDFHIRPath element memberOf context', () => {
  it('evaluates relative memberOf paths against the matched element', async () => {
    const issues = await sdFHIRPathExecutor.execute({
      resource: {
        resourceType: 'Patient',
        maritalStatus: {
          coding: [{
            system: 'https://example.test/fhir/CodeSystem/marital',
            code: 'M',
          }],
        },
      },
      resourceType: 'Patient',
      structureDef: profile,
    });

    expect(issues.find(issue => issue.ruleId === 'marital-memberof')).toBeUndefined();
  });

  it('reports a violation when the matched element is outside the value set', async () => {
    const issues = await sdFHIRPathExecutor.execute({
      resource: {
        resourceType: 'Patient',
        maritalStatus: {
          coding: [{
            system: 'https://example.test/fhir/CodeSystem/marital',
            code: 'X',
          }],
        },
      },
      resourceType: 'Patient',
      structureDef: profile,
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'constraint-violation-marital-memberof',
      path: 'Patient.maritalStatus',
      ruleId: 'marital-memberof',
    }));
  });

  it('returns no issues for a missing runtime structure definition', async () => {
    await expect(sdFHIRPathExecutor.execute({
      resource: { resourceType: 'Patient' },
      resourceType: 'Patient',
      structureDef: undefined as never,
    })).resolves.toEqual([]);
  });
});
