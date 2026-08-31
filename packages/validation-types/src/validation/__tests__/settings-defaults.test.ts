import { describe, expect, it } from 'vitest';
import {
  R4_DEFAULT_INCLUDED_RESOURCE_TYPES,
  R5_DEFAULT_INCLUDED_RESOURCE_TYPES,
  getDefaultValidationSettingsForVersion,
} from '../settings-utils';
import { parseSettings } from '../settings-schema';

describe('validation settings defaults', () => {
  it('includes Bundle in default R4 and R5 validation resource types', () => {
    expect(R4_DEFAULT_INCLUDED_RESOURCE_TYPES).toContain('Bundle');
    expect(R5_DEFAULT_INCLUDED_RESOURCE_TYPES).toContain('Bundle');
  });

  it('enables Bundle validation in generated default settings', () => {
    expect(getDefaultValidationSettingsForVersion('R4').resourceTypes.includedTypes).toContain('Bundle');
    expect(getDefaultValidationSettingsForVersion('R5').resourceTypes.includedTypes).toContain('Bundle');
  });

  it('covers clinical R4 resource types that must not be omitted from a default full run', () => {
    expect(R4_DEFAULT_INCLUDED_RESOURCE_TYPES).toEqual(expect.arrayContaining([
      'MedicationStatement',
      'MedicationAdministration',
      'Specimen',
      'Consent',
      'RequestGroup',
      'QuestionnaireResponse',
      'ImagingStudy',
      'RiskAssessment',
    ]));
  });

  it('disables imposed profile policies by default', () => {
    expect(getDefaultValidationSettingsForVersion('R4').imposedProfiles).toEqual({
      enabled: false,
      policies: [],
    });
    expect(getDefaultValidationSettingsForVersion('R5').imposedProfiles).toEqual({
      enabled: false,
      policies: [],
    });
  });

  it('restores runtime health defaults for legacy terminology servers', () => {
    const defaults = getDefaultValidationSettingsForVersion('R4');
    const terminologyServers = defaults.terminologyServers?.map(({
      failureCount: _failureCount,
      lastFailureTime: _lastFailureTime,
      circuitOpen: _circuitOpen,
      responseTimeAvg: _responseTimeAvg,
      ...server
    }) => server);

    const parsed = parseSettings({ ...defaults, terminologyServers });

    expect(parsed.terminologyServers?.[0]).toMatchObject({
      failureCount: 0,
      lastFailureTime: null,
      circuitOpen: false,
      responseTimeAvg: 0,
    });
  });
});
