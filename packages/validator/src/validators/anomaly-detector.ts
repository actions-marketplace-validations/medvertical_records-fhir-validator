import {
  detectDuplicates,
  detectMissingFields,
  detectOrphanReferences,
} from './anomaly-cohort-detectors';
import {
  DEFAULT_ANOMALY_DETECTOR_CONFIG,
  type AnomalyDetectorConfig,
  type AnomalyFinding,
} from './anomaly-types';

export type { AnomalyDetectorConfig, AnomalyFinding, AnomalyType } from './anomaly-types';

export class AnomalyDetector {
  private config: AnomalyDetectorConfig;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = { ...DEFAULT_ANOMALY_DETECTOR_CONFIG, ...config };
  }

  detect(resources: any[]): AnomalyFinding[] {
    if (!resources || resources.length < this.config.minBatchSize) {
      return [];
    }

    const findings: AnomalyFinding[] = [];

    if (this.config.enableMissingField) {
      findings.push(...detectMissingFields(resources, this.config));
    }
    if (this.config.enableDuplicateDetection) {
      findings.push(...detectDuplicates(resources));
    }
    if (this.config.enableOrphanReferences) {
      findings.push(...detectOrphanReferences(resources));
    }
    if (this.config.enableValueRangeOutlier) {
      findings.push(...this.detectValueRangeOutliers(resources));
    }
    if (this.config.enableTemporalGap) {
      findings.push(...this.detectTemporalGaps(resources));
    }
    if (this.config.enableCodingConsistency) {
      findings.push(...this.detectCodingInconsistencies(resources));
    }

    findings.sort((a, b) => b.confidence - a.confidence || (b.outlierCount ?? 0) - (a.outlierCount ?? 0));

    return findings;
  }

  private static readonly PLAUSIBILITY_RANGES: Array<{
    loincCode: string;
    display: string;
    min: number;
    max: number;
    unit: string;
    unitAliases?: string[];
  }> = [
    { loincCode: '8480-6',  display: 'Systolic BP',      min: 30,   max: 350,  unit: 'mm[Hg]', unitAliases: ['mmHg'] },
    { loincCode: '8462-4',  display: 'Diastolic BP',     min: 10,   max: 250,  unit: 'mm[Hg]', unitAliases: ['mmHg'] },
    { loincCode: '8310-5',  display: 'Body temperature',  min: 25,   max: 45,   unit: 'Cel', unitAliases: ['degC', 'C'] },
    { loincCode: '8310-5',  display: 'Body temperature',  min: 77,   max: 113,  unit: '[degF]', unitAliases: ['degF', '°F', 'F'] },
    { loincCode: '29463-7', display: 'Body weight',       min: 0.1,  max: 700,  unit: 'kg' },
    { loincCode: '8302-2',  display: 'Body height',       min: 10,   max: 300,  unit: 'cm' },
    { loincCode: '8867-4',  display: 'Heart rate',        min: 10,   max: 400,  unit: '/min' },
    { loincCode: '9279-1',  display: 'Respiratory rate',  min: 2,    max: 100,  unit: '/min' },
    { loincCode: '59408-5', display: 'SpO2',              min: 0,    max: 100,  unit: '%' },
    { loincCode: '2339-0',  display: 'Glucose',           min: 1,    max: 2000, unit: 'mg/dL' },
    { loincCode: '2345-7',  display: 'Glucose (alt)',     min: 1,    max: 2000, unit: 'mg/dL' },
    { loincCode: '718-7',   display: 'Hemoglobin',        min: 1,    max: 30,   unit: 'g/dL' },
    { loincCode: '4548-4',  display: 'HbA1c',             min: 2,    max: 25,   unit: '%' },
    { loincCode: '2093-3',  display: 'Total Cholesterol', min: 10,   max: 1500, unit: 'mg/dL' },
    { loincCode: '2571-8',  display: 'Triglycerides',     min: 5,    max: 20000, unit: 'mg/dL' },
    { loincCode: '2160-0',  display: 'Creatinine',        min: 0.01, max: 50,   unit: 'mg/dL' },
  ];

  private static plausibilityMap: Map<string, Array<(typeof AnomalyDetector.PLAUSIBILITY_RANGES)[0]>> | null = null;

  private getPlausibilityMap() {
    if (!AnomalyDetector.plausibilityMap) {
      AnomalyDetector.plausibilityMap = new Map();
      for (const range of AnomalyDetector.PLAUSIBILITY_RANGES) {
        const ranges = AnomalyDetector.plausibilityMap.get(range.loincCode);
        if (ranges) ranges.push(range);
        else AnomalyDetector.plausibilityMap.set(range.loincCode, [range]);
      }
    }
    return AnomalyDetector.plausibilityMap;
  }

  private detectValueRangeOutliers(resources: any[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    const rangeMap = this.getPlausibilityMap();

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      if (r?.resourceType !== 'Observation') continue;

      this.checkQuantityRange(r, r.valueQuantity, `Observation.valueQuantity`, i, rangeMap, findings);

      if (Array.isArray(r.component)) {
        for (let c = 0; c < r.component.length; c++) {
          const comp = r.component[c];
          this.checkQuantityRange(r, comp?.valueQuantity, `Observation.component[${c}].valueQuantity`, i, rangeMap, findings);
        }
      }
    }

    return findings;
  }

  private checkQuantityRange(
    observation: any,
    quantity: any,
    path: string,
    resourceIndex: number,
    rangeMap: Map<string, Array<(typeof AnomalyDetector.PLAUSIBILITY_RANGES)[0]>>,
    findings: AnomalyFinding[],
  ): void {
    if (!quantity || typeof quantity.value !== 'number') return;

    const codings = [
      ...(observation.code?.coding || []),
    ];

    if (path.includes('component')) {
      const compIdx = path.match(/component\[(\d+)\]/)?.[1];
      if (compIdx !== undefined) {
        const comp = observation.component?.[Number(compIdx)];
        codings.push(...(comp?.code?.coding || []));
      }
    }

    for (const coding of codings) {
      if (coding.system !== 'http://loinc.org') continue;
      const range = this.selectPlausibilityRange(coding.code, quantity, rangeMap);
      if (!range) continue;

      const val = quantity.value;
      if (val < range.min || val > range.max) {
        const id = observation.id || `[index ${resourceIndex}]`;
        findings.push({
          type: 'value-distribution-outlier',
          description:
            `${range.display} value ${val} ${quantity.unit || range.unit} is outside the ` +
            `physiologically plausible range (${range.min}–${range.max} ${range.unit}). ` +
            `This is almost certainly a data-entry error or unit-conversion bug.`,
          confidence: 0.9,
          affectedIndices: [resourceIndex],
          affectedIds: [id],
          resourceType: 'Observation',
          fieldPath: path,
          suggestion:
            `Check ${id}: ${range.display} = ${val}. ` +
            `Expected range ${range.min}–${range.max} ${range.unit}. ` +
            `Common causes: wrong unit (lbs vs kg), decimal-point shift, ` +
            `placeholder value not replaced.`,
          outlierCount: 1,
        });
      }
    }
  }

  private selectPlausibilityRange(
    loincCode: string | undefined,
    quantity: any,
    rangeMap: Map<string, Array<(typeof AnomalyDetector.PLAUSIBILITY_RANGES)[0]>>,
  ): (typeof AnomalyDetector.PLAUSIBILITY_RANGES)[0] | undefined {
    if (!loincCode) return undefined;
    const ranges = rangeMap.get(loincCode);
    if (!ranges?.length) return undefined;

    const unit = this.normalizeUnit(quantity?.code ?? quantity?.unit);
    if (!unit) return undefined;

    return ranges.find(range => this.rangeUnitMatches(range, unit));
  }

  private rangeUnitMatches(
    range: (typeof AnomalyDetector.PLAUSIBILITY_RANGES)[0],
    normalizedUnit: string,
  ): boolean {
    return [range.unit, ...(range.unitAliases ?? [])]
      .map(unit => this.normalizeUnit(unit))
      .some(unit => unit === normalizedUnit);
  }

  private normalizeUnit(unit: string | undefined): string | undefined {
    return unit?.trim().toLowerCase();
  }

  private detectTemporalGaps(resources: any[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];
    const gapMs = this.config.temporalGapDays * 24 * 60 * 60 * 1000;

    const subjectTimelines = new Map<string, Array<{ date: Date; index: number; rt: string; id: string; subject: string }>>();

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      if (!r?.resourceType) continue;
      const subject = r.subject?.reference || r.patient?.reference;
      if (!subject) continue;

      let dateStr: string | undefined;
      switch (r.resourceType) {
        case 'Encounter':
          dateStr = r.period?.start; break;
        case 'Observation':
          dateStr = r.effectiveDateTime || r.effectivePeriod?.start; break;
        case 'Condition':
          dateStr = r.onsetDateTime || r.recordedDate; break;
        case 'Procedure':
          dateStr = r.performedDateTime || r.performedPeriod?.start; break;
        case 'MedicationRequest':
          dateStr = r.authoredOn; break;
        case 'DiagnosticReport':
          dateStr = r.effectiveDateTime || r.effectivePeriod?.start; break;
        default:
          continue;
      }
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) continue;

      const code = this.getPrimaryCode(r);
      if (!code) continue;

      const timelineKey = `${subject}|${r.resourceType}|${code}`;
      if (!subjectTimelines.has(timelineKey)) subjectTimelines.set(timelineKey, []);
      subjectTimelines.get(timelineKey)!.push({ date, index: i, rt: r.resourceType, id: r.id || `[${i}]`, subject });
    }

    for (const events of subjectTimelines.values()) {
      if (events.length < 2) continue;
      events.sort((a, b) => a.date.getTime() - b.date.getTime());

      for (let j = 1; j < events.length; j++) {
        const prev = events[j - 1];
        const curr = events[j];
        const diffMs = curr.date.getTime() - prev.date.getTime();

        if (diffMs > gapMs) {
          const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
          const diffMonths = Math.round(diffDays / 30);
          findings.push({
            type: 'temporal-gap',
            description:
              `${diffMonths}-month gap (${diffDays} days) in care timeline for ${curr.subject}: ` +
              `last event ${prev.rt}/${prev.id} on ${prev.date.toISOString().slice(0, 10)}, ` +
              `next event ${curr.rt}/${curr.id} on ${curr.date.toISOString().slice(0, 10)}.`,
            confidence: Math.min(0.5 + (diffDays / 365) * 0.3, 0.9),
            affectedIndices: [prev.index, curr.index],
            affectedIds: [prev.id, curr.id],
            resourceType: 'Patient',
            fieldPath: curr.subject,
            suggestion:
              `Check whether events between ${prev.date.toISOString().slice(0, 10)} and ` +
              `${curr.date.toISOString().slice(0, 10)} were missed during import. ` +
              `If the gap is real (patient transferred care), no action needed.`,
            outlierCount: 1,
          });
        }
      }
    }

    return findings;
  }

  private getPrimaryCode(resource: any): string | undefined {
    const coding = resource.code?.coding?.[0];
    if (coding?.code) return `${coding.system ?? ''}|${coding.code}`;
    return resource.code?.text;
  }

  private detectCodingInconsistencies(resources: any[]): AnomalyFinding[] {
    const findings: AnomalyFinding[] = [];

    const byDisplay = new Map<string, Array<{ index: number; id: string; system: string; code: string }>>();

    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      if (r?.resourceType !== 'Condition' && r?.resourceType !== 'AllergyIntolerance') continue;
      const codings = r.code?.coding || [];
      for (const coding of codings) {
        if (!coding.display) continue;
        const normDisplay = coding.display.toLowerCase().trim();
        if (normDisplay.length < 3) continue;
        if (!byDisplay.has(normDisplay)) byDisplay.set(normDisplay, []);
        byDisplay.get(normDisplay)!.push({
          index: i,
          id: r.id || `[${i}]`,
          system: coding.system || '(no system)',
          code: coding.code || '(no code)',
        });
      }
    }

    for (const [display, entries] of byDisplay) {
      const uniqueCodes = new Set(entries.map(e => `${e.system}|${e.code}`));
      if (uniqueCodes.size < 2) continue;

      const codeList = [...uniqueCodes].map(c => {
        const [sys, code] = c.split('|');
        const sysShort = sys.split('/').pop() || sys;
        return `${sysShort}#${code}`;
      }).join(', ');

      findings.push({
        type: 'coding-inconsistency',
        description:
          `'${display}' is coded differently across ${entries.length} resources: ${codeList}. ` +
          `Inconsistent coding breaks cohort queries and analytics.`,
        confidence: 0.75,
        affectedIndices: entries.map(e => e.index),
        affectedIds: entries.map(e => e.id),
        resourceType: 'Condition',
        suggestion:
          `Standardize coding for '${display}'. Pick one authoritative ` +
          `code system (preferably SNOMED CT) and map all instances to it.`,
        outlierCount: entries.length,
      });
    }

    return findings;
  }

}
