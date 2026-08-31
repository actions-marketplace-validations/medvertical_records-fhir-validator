import { describe, expect, it } from 'vitest';

import type { Constraint } from '../core/structure-definition-types';
import { prepareConstraintEvaluation } from './constraint-evaluation-preparation';
import type { ConstraintValidationState, FhirResource } from './constraint-validation-input';

const profileUrl = 'http://example.org/StructureDefinition/test';
const state = {
  strictnessMode: 'standard',
  fhirVersion: 'R4',
  userInvocationTable: {},
} as unknown as ConstraintValidationState;

function prepare(
  resource: FhirResource,
  constraint: Constraint,
  elementPath = resource.resourceType,
  elementType: string | null = null,
) {
  return prepareConstraintEvaluation({
    resource,
    elementPath,
    constraint,
    profileUrl,
    elementType,
    state,
  });
}

describe('constraint evaluation preparation', () => {
  it('handles constraints without expressions without invoking the runtime', () => {
    expect(prepare(
      { resourceType: 'Patient' },
      { key: 'no-expression', severity: 'error' },
    )).toEqual({ handled: true, issues: [] });
  });

  it('owns the dom-3 deterministic validation outcome', () => {
    const result = prepare(
      {
        resourceType: 'Patient',
        contained: [{ resourceType: 'Organization', id: 'unreferenced' }],
      },
      {
        key: 'dom-3',
        severity: 'error',
        expression: 'true',
      },
    );

    expect(result).toMatchObject({
      handled: true,
      issues: [{ ruleId: 'dom-3' }],
    });
  });

  it('owns specialised root outcomes', () => {
    const result = prepare(
      {
        resourceType: 'CodeSystem',
        concept: [{ code: 'duplicate' }, { code: 'duplicate' }],
      },
      {
        key: 'csd-1',
        severity: 'error',
        expression: 'concept.code.combine(concept.descendants().concept.code).isDistinct()',
      },
    );

    expect(result).toMatchObject({
      handled: true,
      issues: [{ ruleId: 'csd-1', code: 'profile-constraint-violation' }],
    });
  });

  it('preprocesses type literals before handing an expression to the runtime', () => {
    expect(prepare(
      { resourceType: 'Patient', managingOrganization: { reference: 'Organization/1' } },
      {
        key: 'reference-type',
        severity: 'error',
        expression: "%context.type().name = 'Reference'",
      },
      'Patient.managingOrganization',
      'Reference',
    )).toEqual({ handled: false, expression: 'true' });
  });
});
