import { describe, expect, it } from 'vitest';

import {
  decideResourceValidationEligibility,
  planResourceValidation,
} from './resource-validation-eligibility';

const clinicalFilter = {
  enabled: true,
  includedTypes: ['Patient', 'Observation'],
  excludedTypes: [] as string[],
};

describe('resource validation eligibility', () => {
  it.each(['CodeSystem', 'ValueSet', 'ConceptMap', 'NamingSystem'])(
    'allows browsed terminology resource %s outside the bulk include list',
    resourceType => {
      expect(decideResourceValidationEligibility({
        operation: 'browse',
        resourceType,
        resourceTypes: clinicalFilter,
      })).toEqual({
        shouldValidate: true,
        reason: 'browse-resource',
      });
    },
  );

  it('keeps the clinical include list authoritative for bulk validation', () => {
    expect(decideResourceValidationEligibility({
      operation: 'bulk',
      resourceType: 'CodeSystem',
      resourceTypes: clinicalFilter,
    })).toEqual({
      shouldValidate: false,
      reason: 'not-included',
    });
  });

  it('allows an explicitly requested resource outside the bulk cohort', () => {
    expect(decideResourceValidationEligibility({
      operation: 'manual',
      resourceType: 'CodeSystem',
      resourceTypes: clinicalFilter,
    })).toEqual({
      shouldValidate: true,
      reason: 'manual-resource',
    });
  });

  it('respects explicit exclusions during Browse', () => {
    expect(decideResourceValidationEligibility({
      operation: 'browse',
      resourceType: 'ValueSet',
      resourceTypes: {
        ...clinicalFilter,
        excludedTypes: ['ValueSet'],
      },
    })).toEqual({
      shouldValidate: false,
      reason: 'excluded',
    });
  });

  it('validates all resource types when resource filtering is disabled', () => {
    expect(decideResourceValidationEligibility({
      operation: 'bulk',
      resourceType: 'CodeSystem',
      resourceTypes: {
        enabled: false,
        includedTypes: ['Patient'],
        excludedTypes: ['CodeSystem'],
      },
    })).toEqual({
      shouldValidate: true,
      reason: 'filter-disabled',
    });
  });

  it('treats missing legacy policy arrays as empty lists', () => {
    expect(decideResourceValidationEligibility({
      operation: 'browse',
      resourceType: 'CodeSystem',
      resourceTypes: {
        enabled: true,
      } as never,
    })).toEqual({
      shouldValidate: true,
      reason: 'browse-resource',
    });
  });

  it('plans eligible and skipped resources without losing policy reasons', () => {
    const resources = [
      { resourceType: 'CodeSystem', id: 'codes' },
      { resourceType: 'ValueSet', id: 'excluded-values' },
    ];

    expect(planResourceValidation({
      operation: 'browse',
      resources,
      resourceTypes: {
        ...clinicalFilter,
        excludedTypes: ['ValueSet'],
      },
    })).toEqual({
      eligible: [resources[0]],
      skipped: [{
        resource: resources[1],
        decision: { shouldValidate: false, reason: 'excluded' },
      }],
    });
  });
});
