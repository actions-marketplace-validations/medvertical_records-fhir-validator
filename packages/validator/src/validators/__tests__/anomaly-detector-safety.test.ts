import { describe, expect, it } from 'vitest';

import { AnomalyDetector } from '../anomaly-detector';
import { detectOrphanReferences } from '../anomaly-cohort-detectors';

describe('AnomalyDetector safety', () => {
  it('returns no findings for non-array inputs', () => {
    const detector = new AnomalyDetector({ minBatchSize: 1 });

    expect(detector.detect(null)).toEqual([]);
    expect(detector.detect({ resourceType: 'Patient' })).toEqual([]);
  });

  it('normalizes invalid configuration values', () => {
    const detector = new AnomalyDetector({
      minBatchSize: 0,
      temporalGapDays: Number.NaN,
      missingFieldThreshold: 2,
    });

    expect(() => detector.detect([{
      resourceType: 'Observation',
      code: { coding: [null, 42] },
      valueQuantity: { value: Number.NaN, unit: Symbol('Cel') },
    }])).not.toThrow();
  });

  it('does not apply an Observation code range to an unrelated component', () => {
    const findings = new AnomalyDetector({ minBatchSize: 1 }).detect([{
      resourceType: 'Observation',
      id: 'panel',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8310-5',
        }],
      },
      component: [{
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: 'unknown-component',
          }],
        },
        valueQuantity: {
          value: 1000,
          code: 'Cel',
        },
      }],
    }]);

    expect(findings.filter(
      finding => finding.type === 'value-distribution-outlier',
    )).toEqual([]);
  });

  it('uses the first usable coding rather than requiring coding zero', () => {
    const detector = new AnomalyDetector({
      minBatchSize: 1,
      temporalGapDays: 30,
    });
    const makeObservation = (id: string, date: string) => ({
      resourceType: 'Observation',
      id,
      subject: { reference: 'Patient/p1' },
      effectiveDateTime: date,
      code: {
        coding: [
          null,
          { display: 'Missing code' },
          { system: 'http://loinc.org', code: '8310-5' },
        ],
      },
    });

    const findings = detector.detect([
      makeObservation('old', '2025-01-01T00:00:00Z'),
      makeObservation('new', '2025-03-15T00:00:00Z'),
    ]);

    expect(findings.filter(finding => finding.type === 'temporal-gap'))
      .toHaveLength(1);
  });

  it('does not let duplicate references in one source fake multiple orphan sources', () => {
    const cyclic: Record<string, unknown> = {
      resourceType: 'Observation',
      id: 'source',
      subject: { reference: 'Patient/missing' },
      performer: [{ reference: 'Patient/missing' }],
    };
    cyclic.loop = cyclic;

    const findings = detectOrphanReferences([
      cyclic,
      { resourceType: 'Patient', id: 'present' },
    ]);

    expect(findings).toEqual([]);
  });

  it('reports orphan references only when distinct source resources agree', () => {
    const findings = detectOrphanReferences([
      {
        resourceType: 'Observation',
        id: 'one',
        subject: { reference: 'Patient/missing' },
      },
      {
        resourceType: 'Condition',
        id: 'two',
        subject: { reference: 'Patient/missing' },
      },
      { resourceType: 'Patient', id: 'present' },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'orphan-reference',
        affectedIndices: [0, 1],
        affectedIds: ['one', 'two'],
      }),
    ]);
  });

  it('uses collision-free duplicate grouping keys', () => {
    const detector = new AnomalyDetector({
      minBatchSize: 1,
      enableMissingField: false,
      enableOrphanReferences: false,
      enableValueRangeOutlier: false,
      enableTemporalGap: false,
      enableCodingConsistency: false,
    });
    const findings = detector.detect([
      {
        resourceType: 'Observation',
        subject: { reference: 'Patient/a|b' },
        code: { text: 'c' },
        effectiveDateTime: '2026-01-01',
      },
      {
        resourceType: 'Observation',
        subject: { reference: 'Patient/a' },
        code: { text: 'b|c' },
        effectiveDateTime: '2026-01-01',
      },
    ]);

    expect(findings).toEqual([]);
  });

  it('skips malformed coding entries during consistency analysis', () => {
    const detector = new AnomalyDetector({ minBatchSize: 1 });

    expect(() => detector.detect([
      {
        resourceType: 'Condition',
        code: { coding: [null, 42, { display: Symbol('display') }] },
      },
    ])).not.toThrow();
  });
});
