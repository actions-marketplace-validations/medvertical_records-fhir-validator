import { describe, expect, it } from 'vitest';

import type { ElementDefinition } from '../../core/structure-definition-types';
import { ConstraintValidator } from '../constraint-validator';

describe('ConstraintValidator input safety', () => {
  it('ignores values that are not FHIR resources', async () => {
    const validator = new ConstraintValidator();

    await expect(validator.validate(
      null,
      [],
      'http://example.org/StructureDefinition/Patient',
    )).resolves.toEqual([]);
    await expect(validator.validate(
      { resourceType: 42 },
      [],
      'http://example.org/StructureDefinition/Patient',
    )).resolves.toEqual([]);
  });

  it('skips malformed elements and constraints while evaluating valid siblings', async () => {
    const validator = new ConstraintValidator();
    const elements = [
      null,
      {},
      { path: 42, constraint: [] },
      {
        path: 'Patient',
        constraint: [
          null,
          {},
          {
            key: 'wrong-expression-shape',
            severity: 'error',
            human: 'Malformed expression',
            expression: { nested: true },
          },
          {
            key: 'patient-active',
            severity: 'error',
            human: 'Patient must be active',
            expression: 'active = true',
          },
        ],
      },
    ] as unknown as ElementDefinition[];

    const issues = await validator.validate(
      {
        resourceType: 'Patient',
        active: false,
      },
      elements,
      'http://example.org/StructureDefinition/Patient',
    );

    expect(issues).toEqual([
      expect.objectContaining({
        ruleId: 'patient-active',
        path: 'Patient',
      }),
    ]);
  });

  it('does not iterate a malformed element collection', async () => {
    const validator = new ConstraintValidator();

    await expect(validator.validate(
      { resourceType: 'Patient' },
      { path: 'Patient' } as unknown as ElementDefinition[],
      'http://example.org/StructureDefinition/Patient',
    )).resolves.toEqual([]);
  });
});
