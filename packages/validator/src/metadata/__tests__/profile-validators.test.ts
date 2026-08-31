import { afterEach, describe, expect, it } from 'vitest';
import { ProfileValidator } from '../profile-validators';
import { setProfileSource } from '../../persistence';

describe('ProfileValidator', () => {
  afterEach(() => {
    setProfileSource({});
  });

  it('reports malformed entries and continues duplicate detection', () => {
    const profile = 'http://example.com/StructureDefinition/Patient';
    const issues = new ProfileValidator().validateUrls(
      [null, profile, profile],
      'Patient',
    );

    expect(issues.some(issue => issue.code === 'metadata-profile-invalid-type')).toBe(true);
    expect(issues.some(issue => issue.code === 'metadata-profile-duplicate')).toBe(true);
  });

  it('reports a non-array boundary value', () => {
    const issues = new ProfileValidator().validateUrls(
      { profile: 'http://example.com/StructureDefinition/Patient' },
      'Patient',
    );

    expect(issues.map(issue => issue.code)).toContain('metadata-profile-invalid-array');
  });

  it('does not expose profile source exception text', async () => {
    const secret = 'postgresql://user:password@example.test/private';
    setProfileSource({
      resolveProfile: async () => {
        throw new Error(secret);
      },
    });

    const issues = await new ProfileValidator().validateAccessibility(
      ['https://example.test/StructureDefinition/Patient'],
      'Patient',
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'profile-load-error',
      message:
        'Profile resolution could not be completed because the validator encountered an operational error.',
      details: expect.objectContaining({
        failureKind: 'unknown',
      }),
    }));
    expect(JSON.stringify(issues)).not.toContain(secret);
  });
});
