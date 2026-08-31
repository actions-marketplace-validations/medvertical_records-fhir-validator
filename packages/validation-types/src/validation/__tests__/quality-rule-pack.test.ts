import { describe, expect, it } from 'vitest';

import {
  parseQualityRulePackManifest,
  qualityRulePackManifestSchema,
} from '../quality-rule-pack';
import { parseQualityRulePackDraftManifest } from '../quality-rule-pack-draft';

const validManifest = {
  schemaVersion: 1,
  id: 'example-quality',
  version: '1.0.0',
  name: 'Example quality',
  fhirVersions: ['R4'],
  igPackages: [],
  source: { label: 'Example source', url: 'https://example.org/quality' },
  rules: [{
    id: 'patient-identifier-present',
    title: 'Patient identifier is present',
    category: 'completeness',
    scope: 'resource',
    severity: 'warning',
    normativeStatus: 'informative',
    comparisonClass: 'common-baseline',
    applicability: { resourceTypes: ['Patient'], fhirVersions: ['R4'], profilesAny: [] },
    implementation: { kind: 'path-presence', path: 'identifier' },
    evidencePaths: ['Patient.identifier'],
    source: { label: 'Example source' },
    limitations: [],
  }],
} as const;

describe('quality rule-pack contract', () => {
  it('parses a bounded versioned manifest', () => {
    expect(parseQualityRulePackManifest(validManifest)).toMatchObject({
      id: 'example-quality',
      version: '1.0.0',
    });
  });

  it('rejects duplicate ids and scope/implementation mismatches', () => {
    const parsed = qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [
        validManifest.rules[0],
        {
          ...validManifest.rules[0],
          scope: 'cohort',
        },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'Duplicate rule id: patient-identifier-present',
      'Cohort rules require a cohort implementation',
    ]));
  });

  it('rejects prototype-pollution shaped rule identifiers', () => {
    const parsed = qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [{
        ...validManifest.rules[0],
        id: '__proto__',
      }],
    });
    expect(parsed.success).toBe(false);
  });

  it('allows an empty authoring draft but keeps published packs non-empty', () => {
    const emptyDraft = { ...validManifest, rules: [] };

    expect(parseQualityRulePackDraftManifest(emptyDraft).rules).toEqual([]);
    expect(qualityRulePackManifestSchema.safeParse(emptyDraft).success).toBe(false);
  });

  it('allows an advisory-only published pack and validates action-specific transforms', () => {
    const advisoryOnly = {
      ...validManifest,
      rules: [],
      advisories: [{
        id: 'reviewed-warning',
        title: 'Downgrade reviewed warnings',
        priority: 100,
        target: 'quality-finding',
        action: 'override-severity',
        match: { severities: ['warning'] },
        transform: { severity: 'information' },
        reason: 'Reviewed by the data-quality team.',
        source: { label: 'Workspace policy' },
      }],
    };

    expect(parseQualityRulePackManifest(advisoryOnly).advisories).toHaveLength(1);
    expect(qualityRulePackManifestSchema.safeParse({
      ...advisoryOnly,
      advisories: [{ ...advisoryOnly.advisories[0], transform: undefined }],
    }).success).toBe(false);
  });

  it('rejects match-all advisories and duplicate ids across rule phases', () => {
    const parsed = qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      advisories: [{
        id: validManifest.rules[0].id,
        title: 'Unsafe handling',
        action: 'suppress',
        match: {},
        reason: 'Should not parse.',
        source: { label: 'Test' },
      }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'Advisory rules require at least one match criterion',
      `Duplicate rule id: ${validManifest.rules[0].id}`,
    ]));
  });

  it('bounds thresholds according to their unit', () => {
    for (const threshold of [
      { operator: 'gte', value: 1.01, unit: 'ratio' },
      { operator: 'gte', value: 101, unit: 'percent' },
      { operator: 'gte', value: 1.5, unit: 'count' },
      { operator: 'gte', value: -1, unit: 'count' },
    ]) {
      expect(qualityRulePackManifestSchema.safeParse({
        ...validManifest,
        rules: [{ ...validManifest.rules[0], threshold }],
      }).success).toBe(false);
    }
  });

  it('rejects advisory criteria that belong to the other result taxonomy', () => {
    const baseAdvisory = {
      id: 'review-signal',
      title: 'Review signal',
      priority: 10,
      action: 'suppress',
      reason: 'Test taxonomy boundary.',
      source: { label: 'Test' },
    } as const;

    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      advisories: [{
        ...baseAdvisory,
        target: 'quality-finding',
        match: { codes: ['invalid'] },
      }],
    }).success).toBe(false);
    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      advisories: [{
        ...baseAdvisory,
        target: 'validation-issue',
        match: { categories: ['completeness'] },
      }],
    }).success).toBe(false);
  });

  it('keeps inline reference sets bounded and collision-free', () => {
    const referenceSet = {
      id: 'allowed-status',
      name: 'Allowed status',
      caseSensitive: false,
      values: ['Active', 'active'],
      source: { label: 'Test' },
    };
    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      referenceSets: [referenceSet],
    }).success).toBe(false);
  });

  it('validates coded cohort distributions without breaking the implementation union', () => {
    const distributionRule = {
      ...validManifest.rules[0],
      scope: 'cohort',
      implementation: {
        kind: 'cohort-distribution',
        valueExpression: 'Patient.gender',
        valueMode: 'coded',
      },
    };

    const missingCodeSystem = qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [distributionRule],
    });
    expect(missingCodeSystem.success).toBe(false);
    expect(missingCodeSystem.error?.issues.map(issue => issue.message)).toContain(
      'Coded distributions require a declared code system',
    );

    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [{
        ...distributionRule,
        implementation: {
          ...distributionRule.implementation,
          codeSystem: 'http://hl7.org/fhir/administrative-gender',
        },
      }],
    }).success).toBe(true);
  });

  it('accepts only package ranges that the policy resolver can evaluate', () => {
    for (const versionRange of ['*', '2026.x', '2026.1.x', '2026.1.0', '2026.1.0-next.1']) {
      expect(qualityRulePackManifestSchema.safeParse({
        ...validManifest,
        igPackages: [{ packageId: 'example.package', versionRange }],
      }).success).toBe(true);
    }
    for (const versionRange of ['>=2026', '^2026.1.0', '2026.x.1', 'latest']) {
      expect(qualityRulePackManifestSchema.safeParse({
        ...validManifest,
        igPackages: [{ packageId: 'example.package', versionRange }],
      }).success).toBe(false);
    }
  });

  it('keeps descriptive distributions bounded and separate from pass/fail thresholds', () => {
    const distributionRule = {
      ...validManifest.rules[0],
      scope: 'cohort',
      implementation: {
        kind: 'cohort-distribution',
        valueExpression: 'gender',
        maxStrata: 25,
        valueMode: 'coded',
        codeSystem: 'http://hl7.org/fhir/administrative-gender',
      },
    };
    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [distributionRule],
    }).success).toBe(true);
    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [{ ...distributionRule, threshold: { operator: 'gte', value: 0.9, unit: 'ratio' } }],
    }).success).toBe(false);
    expect(qualityRulePackManifestSchema.safeParse({
      ...validManifest,
      rules: [{
        ...distributionRule,
        implementation: { ...distributionRule.implementation, codeSystem: undefined },
      }],
    }).success).toBe(false);
  });
});
