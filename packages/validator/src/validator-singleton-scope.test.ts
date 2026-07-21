import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  validate: vi.fn().mockResolvedValue([]),
}));

vi.mock('./core/validator-engine', () => ({
  RecordsValidator: class RecordsValidator {
    constructor() {
      mocks.constructor();
    }

    validate = mocks.validate;
  },
}));

vi.mock('./logger', () => ({
  logger: { info: vi.fn() },
}));

import { recordsValidator } from './validator-singleton';

describe('Records validator runtime scope registry', () => {
  beforeEach(() => {
    mocks.constructor.mockClear();
    mocks.validate.mockClear();
  });

  it('reuses a validator within one immutable runtime scope', async () => {
    await recordsValidator.validate({ resourceType: 'Patient' }, undefined, 'R4', undefined,
      undefined, undefined, 1, '1:10:settings-a');
    await recordsValidator.validate({ resourceType: 'Patient' }, undefined, 'R4', undefined,
      undefined, undefined, 1, '1:10:settings-a');

    expect(mocks.constructor).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent cold starts for the same scope', async () => {
    await Promise.all(Array.from({ length: 20 }, () => recordsValidator.validate(
      { resourceType: 'Patient' },
      undefined,
      'R4',
      undefined,
      undefined,
      undefined,
      5,
      '5:50:concurrent-settings',
    )));

    expect(mocks.constructor).toHaveBeenCalledTimes(1);
  });

  it('isolates validators for different tenant or settings scopes', async () => {
    await recordsValidator.validate({ resourceType: 'Patient' }, undefined, 'R4', undefined,
      undefined, undefined, 11, '11:10:settings-a');
    await recordsValidator.validate({ resourceType: 'Patient' }, undefined, 'R4', undefined,
      undefined, undefined, 12, '12:10:settings-a');
    await recordsValidator.validate({ resourceType: 'Patient' }, undefined, 'R4', undefined,
      undefined, undefined, 11, '11:10:settings-b');

    expect(mocks.constructor).toHaveBeenCalledTimes(3);
  });
});
