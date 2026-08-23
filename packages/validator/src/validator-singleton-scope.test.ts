import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  configs: [] as Array<Record<string, unknown>>,
  validate: vi.fn().mockResolvedValue([]),
  waitForInitialization: vi.fn().mockResolvedValue(undefined),
  loadProfileWithSnapshot: vi.fn().mockResolvedValue({ resourceType: 'StructureDefinition' }),
  resetProfileWarmupState: vi.fn(),
}));

vi.mock('./core/validator-engine', () => ({
  RecordsValidator: class RecordsValidator {
    constructor(config: Record<string, unknown>) {
      mocks.constructor();
      mocks.configs.push(config);
    }

    validate = mocks.validate;
    waitForInitialization = mocks.waitForInitialization;
    loadProfileWithSnapshot = mocks.loadProfileWithSnapshot;
    resetProfileWarmupState = mocks.resetProfileWarmupState;
  },
}));

vi.mock('./logger', () => ({
  logger: { info: vi.fn() },
}));

import {
  acquireRecordsValidatorRuntime,
  recordsValidator,
} from './validator-singleton';

describe('Records validator runtime scope registry', () => {
  beforeEach(() => {
    mocks.constructor.mockClear();
    mocks.configs.length = 0;
    mocks.validate.mockClear();
    mocks.waitForInitialization.mockClear();
    mocks.loadProfileWithSnapshot.mockClear();
    mocks.resetProfileWarmupState.mockClear();
  });

  it('reuses a validator within one immutable runtime scope', async () => {
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 1,
      runtimeScopeKey: '1:10:settings-a',
    });
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 1,
      runtimeScopeKey: '1:10:settings-a',
    });

    expect(mocks.constructor).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent cold starts for the same scope', async () => {
    await Promise.all(Array.from({ length: 20 }, () => recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 5,
      runtimeScopeKey: '5:50:concurrent-settings',
    })));

    expect(mocks.constructor).toHaveBeenCalledTimes(1);
    expect(mocks.configs[0]).toMatchObject({
      prewarmProfileSource: false,
      profileCacheMaxEntries: 192,
      allowedPackages: expect.arrayContaining([
        'de.einwilligungsmanagement',
      ]),
    });
  });

  it('isolates validators for different tenant or settings scopes', async () => {
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 11,
      runtimeScopeKey: '11:10:settings-a',
    });
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 12,
      runtimeScopeKey: '12:10:settings-a',
    });
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R4',
      organizationId: 11,
      runtimeScopeKey: '11:10:settings-b',
    });

    expect(mocks.constructor).toHaveBeenCalledTimes(3);
  });

  it('pins one scoped instance across prepare, prewarm, and validation', async () => {
    const runtime = acquireRecordsValidatorRuntime('31:10:leased-settings');
    await runtime.ready();
    await runtime.loadProfileWithSnapshot(
      'https://profiles.example.test/Patient',
      'R5',
    );
    await recordsValidator.validateRequest({
      resource: { resourceType: 'Patient' },
      fhirVersion: 'R5',
      organizationId: 31,
      runtimeScopeKey: '31:10:leased-settings',
    });
    runtime.release();

    expect(mocks.constructor).toHaveBeenCalledTimes(1);
    expect(mocks.waitForInitialization).toHaveBeenCalledTimes(2);
    expect(mocks.loadProfileWithSnapshot).toHaveBeenCalledWith(
      'https://profiles.example.test/Patient',
      'R5',
    );
  });
});
