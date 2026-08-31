import { describe, expect, it } from 'vitest';

import type { Constraint } from '../core/structure-definition-types';
import { ConstraintEvaluationPrecheckPipeline } from './constraint-evaluation-precheck-pipeline';
import { ConstraintExpressionCache } from './constraint-expression-cache';
import type { ConstraintValidationState, FhirResource } from './constraint-validation-input';
import { ValueSetCache } from './valueset-cache';

const profileUrl = 'http://example.org/StructureDefinition/patient';
const state = {
  strictnessMode: 'standard',
  fhirVersion: 'R4',
  userInvocationTable: {},
} as unknown as ConstraintValidationState;

function createPipeline(): ConstraintEvaluationPrecheckPipeline {
  return new ConstraintEvaluationPrecheckPipeline(
    new ValueSetCache(),
    new ConstraintExpressionCache(),
  );
}

function constraint(expression: string): Constraint {
  return {
    key: 'precheck-test',
    severity: 'error',
    human: 'The precheck must pass',
    expression,
  };
}

describe('constraint evaluation precheck pipeline', () => {
  it('passes unsupported shapes to the general evaluator with resolved context', async () => {
    const resource = { resourceType: 'Patient', active: true } as FhirResource;
    const expression = 'active.exists()';

    const result = await createPipeline().evaluate({
      resource,
      elementPath: 'Patient',
      constraint: constraint(expression),
      profileUrl,
      expression,
      state,
      terminologyResolverConfigured: false,
    });

    expect(result).toEqual({
      handled: false,
      context: resource,
      expression,
    });
  });

  it('owns determinate trailing memberOf failures', async () => {
    const resource = {
      resourceType: 'Patient',
      address: [{ country: 'XX' }],
    } as FhirResource;
    const expression = "address.country.memberOf('http://hl7.org/fhir/ValueSet/iso3166-1-2')";

    const result = await createPipeline().evaluate({
      resource,
      elementPath: 'Patient',
      constraint: constraint(expression),
      profileUrl,
      expression,
      state,
      terminologyResolverConfigured: false,
    });

    expect(result).toMatchObject({
      handled: true,
      issues: [{ ruleId: 'precheck-test', code: 'profile-constraint-violation' }],
    });
  });

  it('owns determinate resolve outcomes from bundle context', async () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'urn:uuid:patient-1' },
    } as FhirResource;
    const expression = 'subject.resolve().where(active = true).exists()';
    const bundleState = {
      ...state,
      bundle: {
        resourceType: 'Bundle',
        entry: [{
          fullUrl: 'urn:uuid:patient-1',
          resource: { resourceType: 'Patient', id: 'patient-1', active: true },
        }],
      },
    };

    const result = await createPipeline().evaluate({
      resource,
      elementPath: 'Observation',
      constraint: constraint(expression),
      profileUrl,
      expression,
      state: bundleState,
      terminologyResolverConfigured: false,
    });

    expect(result).toEqual({ handled: true, issues: [] });
  });

  it('rewrites cold-cache legacy terminology expressions for async fallback', async () => {
    const resource = {
      resourceType: 'Condition',
      category: [{ coding: [{ code: 'problem-list-item' }] }],
    } as FhirResource;
    const valueSetUrl = 'http://example.org/ValueSet/condition-category';
    const expression = `where(category in '${valueSetUrl}').exists()`;

    const result = await createPipeline().evaluate({
      resource,
      elementPath: 'Condition',
      constraint: constraint(expression),
      profileUrl,
      expression,
      state,
      terminologyResolverConfigured: true,
    });

    expect(result).toMatchObject({
      handled: false,
      context: resource,
      expression: `where(category.memberOf('${valueSetUrl}')).exists()`,
    });
  });
});
