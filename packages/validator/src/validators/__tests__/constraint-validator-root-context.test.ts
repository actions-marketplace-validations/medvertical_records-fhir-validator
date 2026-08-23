import { describe, expect, it } from 'vitest';
import { ConstraintValidator } from '../constraint-validator';

describe('ConstraintValidator resource-root expression handling', () => {
  it('binds context and resource types correctly for Bundle entry resources', async () => {
    const validator = new ConstraintValidator();

    const issues = await validator.validate(
      {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Patient', id: 'patient-1' } },
          { resource: { resourceType: 'Patient', id: 'patient-2' } },
        ],
      },
      [{
        path: 'Bundle.entry.resource',
        constraint: [{
          key: 'variables-test',
          severity: 'error' as const,
          human: 'Check context variables are set correctly',
          expression: "%context.type().name = 'Patient' and %resource.type().name = 'Bundle' and %rootResource.type().name = 'Bundle'",
        }],
      }],
      'http://example.org/StructureDefinition/bundle-context',
    );

    expect(issues.find(issue => issue.ruleId === 'variables-test')).toBeUndefined();
  });

  it('binds resource to the nearest contained resource ancestor', async () => {
    const validator = new ConstraintValidator();

    const issues = await validator.validate(
      {
        resourceType: 'Patient',
        contained: [{
          resourceType: 'Practitioner',
          id: 'practitioner-1',
          name: [{ family: 'Curie' }],
        }],
      },
      [{
        path: 'Patient.contained.name',
        constraint: [{
          key: 'contained-context',
          severity: 'error' as const,
          human: 'Check contained-resource context variables',
          expression: "%context.type().name = 'HumanName' and %resource.type().name = 'Practitioner' and %rootResource.type().name = 'Patient'",
        }],
      }],
      'http://example.org/StructureDefinition/contained-context',
    );

    expect(issues.find(issue => issue.ruleId === 'contained-context')).toBeUndefined();
  });

  it('evaluates absolute resource-root expressions from nested elements only once', async () => {
    const validator = new ConstraintValidator();

    const issues = await validator.validate(
      {
        resourceType: 'Patient',
        active: false,
        name: [
          { family: 'Curie' },
          { family: 'Meitner' },
        ],
      },
      [
        {
          id: 'Patient.name',
          path: 'Patient.name',
          min: 0,
          constraint: [{
            key: 'root-active',
            severity: 'error' as const,
            human: 'Patient must be active',
            expression: 'Patient.active = true',
          }],
        },
      ],
      'http://example.org/StructureDefinition/Patient',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(expect.objectContaining({
      path: 'Patient.name',
      ruleId: 'root-active',
    }));
  });

  it('does not flag nested absolute resource-root expressions when the root matches', async () => {
    const validator = new ConstraintValidator();

    const issues = await validator.validate(
      {
        resourceType: 'Patient',
        active: true,
        name: [{ family: 'Curie' }],
      },
      [
        {
          id: 'Patient.name',
          path: 'Patient.name',
          min: 0,
          constraint: [{
            key: 'root-active',
            severity: 'error' as const,
            human: 'Patient must be active',
            expression: '(Patient.active = true)',
          }],
        },
      ],
      'http://example.org/StructureDefinition/Patient',
    );

    expect(issues).toHaveLength(0);
  });
});
