import { describe, expect, it } from 'vitest';
import { RuleRegistry } from '../../rule-registry';
import { validatePatientAge } from '../patient-validators';
import {
  validateObservationEffectiveDate,
  validateObservationStatusValueConsistency,
  validateObservationValueRange,
} from '../observation-validators';
import { validateConditionOnsetDate } from '../condition-validators';
import {
  validateEncounterPeriod,
  validateEncounterStatusPeriodConsistency,
} from '../encounter-validators';

describe('business rule validator input boundaries', () => {
  it.each([null, undefined, 'resource', 42, []])(
    'returns no issues for a malformed resource root',
    async resource => {
      await expect(validatePatientAge(resource, 'Patient')).resolves.toEqual([]);
      await expect(validateObservationValueRange(resource, 'Observation')).resolves.toEqual([]);
      await expect(validateConditionOnsetDate(resource, 'Condition')).resolves.toEqual([]);
      await expect(validateEncounterPeriod(resource, 'Encounter')).resolves.toEqual([]);
    },
  );

  it('reports invalid non-string dates without throwing', async () => {
    const symbolDate = Symbol('not-a-date');
    const patientIssues = await validatePatientAge({
      resourceType: 'Patient',
      birthDate: symbolDate,
    }, 'Patient');
    const observationIssues = await validateObservationEffectiveDate({
      resourceType: 'Observation',
      effectiveDateTime: symbolDate,
    }, 'Observation');

    expect(patientIssues[0]?.code).toBe('business-invalid-birth-date');
    expect(patientIssues[0]?.message).toContain('not-a-date');
    expect(observationIssues[0]?.code).toBe('business-invalid-effective-date');
  });

  it.each(['2024-13', '2024-02-31'])(
    'rejects invalid partial FHIR dates: %s',
    async birthDate => {
      const issues = await validatePatientAge({
        resourceType: 'Patient',
        birthDate,
      }, 'Patient');

      expect(issues[0]?.code).toBe('business-invalid-birth-date');
    },
  );

  it('creates deterministic issue IDs for identical findings', async () => {
    const resource = {
      resourceType: 'Observation',
      status: 'final',
    };

    const first = await validateObservationStatusValueConsistency(resource, 'Observation');
    const second = await validateObservationStatusValueConsistency(resource, 'Observation');

    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('uses the first usable coding instead of assuming coding[0]', async () => {
    const issues = await validateObservationValueRange({
      resourceType: 'Observation',
      code: {
        coding: [null, {}, { code: '8867-4' }],
      },
      valueQuantity: {
        value: 10,
        unit: '/min',
      },
    }, 'Observation');

    expect(issues[0]?.code).toBe('business-value-out-of-range');
  });

  it('does not apply numeric ranges to non-finite values', async () => {
    const issues = await validateObservationValueRange({
      resourceType: 'Observation',
      code: { coding: [{ code: '8867-4' }] },
      valueQuantity: { value: Number.NaN, unit: '/min' },
    }, 'Observation');

    expect(issues).toEqual([]);
  });

  it('validates each present encounter period endpoint independently', async () => {
    const issues = await validateEncounterPeriod({
      resourceType: 'Encounter',
      period: {
        start: 'not-a-date',
        end: Symbol('bad-end'),
      },
    }, 'Encounter');

    expect(issues.map(issue => issue.code)).toEqual([
      'business-invalid-period-start',
      'business-invalid-period-end',
    ]);
  });

  it('handles malformed encounter periods in status consistency checks', async () => {
    const issues = await validateEncounterStatusPeriodConsistency({
      resourceType: 'Encounter',
      status: 'finished',
      period: 'broken',
    }, 'Encounter');

    expect(issues[0]?.code).toBe('business-finished-status-no-end');
  });
});

describe('RuleRegistry', () => {
  it('registers direct validators that remain callable without class binding', async () => {
    const registry = new RuleRegistry();
    const rule = registry
      .getRulesForResourceType('Observation')
      .find(candidate => candidate.name === 'observation-status-value-consistency');

    expect(rule).toBeDefined();
    await expect(rule?.validator({
      resourceType: 'Observation',
      status: 'final',
      valueBoolean: false,
    }, 'Observation')).resolves.toEqual([]);
  });
});
