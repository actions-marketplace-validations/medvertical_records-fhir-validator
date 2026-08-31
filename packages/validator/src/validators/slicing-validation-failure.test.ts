import { afterEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: logs }));

import { handleSlicingValidationFailure } from './slicing-validation-failure';

describe('slicing validation failure policy', () => {
  afterEach(() => vi.clearAllMocks());

  it('keeps exception details out of public issues and logs', () => {
    const secret = 'https://user:password@example.test/private';

    const issue = handleSlicingValidationFailure(
      new Error(secret),
      'Patient.identifier',
    );

    expect(issue).toEqual(expect.objectContaining({
      code: 'profile-slice-validation-error',
      path: 'Patient.identifier',
      resourceType: 'Patient',
      message:
        'Slicing validation could not be completed because the validator encountered an operational error.',
    }));
    expect(JSON.stringify(issue)).not.toContain(secret);
    expect(logs.error).toHaveBeenCalledWith(
      '[SlicingValidator] Slicing validation failed',
      expect.objectContaining({ failureKind: 'unknown' }),
    );
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain(secret);
  });
});
