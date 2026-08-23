import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../logger';
import { SecurityValidator } from '../security-validator';

const SCAN_ONLY_CONFIG = {
  detectPHI: true,
  detectSensitiveIdentifiers: true,
  requireSecurityLabels: false,
  validateAuditTrail: false,
} as const;

describe('SecurityValidator safety and issue identity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is total over malformed resource roots and nested values', () => {
    const validator = new SecurityValidator(SCAN_ONLY_CONFIG);

    expect(validator.validate(null)).toEqual([]);
    expect(validator.validate([])).toEqual([]);
    expect(validator.validate(Symbol('resource'))).toEqual([]);
    expect(validator.validate({
      resourceType: Symbol('Patient'),
      text: { div: { malformed: true } },
      identifier: [null, [], 'value', { value: 42 }],
    })).toEqual([]);
  });

  it('creates deterministic IDs while distinguishing identifier paths', () => {
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      piiLocale: 'us',
    });
    const resource = {
      resourceType: 'Patient',
      identifier: [
        { value: '123-45-6789' },
        { value: '123-45-6789' },
      ],
    };

    const first = validator.validate(resource);
    const second = validator.validate(resource);

    expect(first.map(issue => issue.id)).toEqual(second.map(issue => issue.id));
    expect(new Set(first.map(issue => issue.id)).size).toBe(2);
  });

  it('treats malformed security labels as missing policy evidence, not a crash', () => {
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      detectPHI: false,
      detectSensitiveIdentifiers: false,
      requireSecurityLabels: true,
    });

    const issues = validator.validate({
      resourceType: 'Patient',
      meta: { security: 'not-an-array' },
    });

    expect(issues.map(issue => issue.code)).toEqual(['security-missing-labels']);
    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'security-validator-error',
    }));
  });

  it('reports invalid custom patterns and continues with later patterns', () => {
    const sensitivePattern = '[private-token';
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      detectPHI: false,
      detectSensitiveIdentifiers: false,
      customPatterns: [
        { pattern: sensitivePattern, name: 'Broken rule', severity: 'warning' },
        { pattern: 'secret', name: 'Secret', severity: 'warning' },
      ],
    });

    const issues = validator.validate({
      resourceType: 'DocumentReference',
      description: 'secret',
    });

    expect(issues.map(issue => issue.code)).toEqual([
      'security-custom-pattern-invalid',
      'security-custom-secret',
    ]);
    expect(JSON.stringify(issues)).not.toContain(sensitivePattern);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sensitivePattern);
  });

  it('promotes an unscannable custom-pattern input to one stable failure issue', () => {
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      detectPHI: false,
      detectSensitiveIdentifiers: false,
      customPatterns: [
        { pattern: 'secret', name: 'Secret', severity: 'warning' },
      ],
    });
    const resource: Record<string, unknown> = {
      resourceType: 'DocumentReference',
    };
    resource.self = resource;

    const first = validator.validate(resource);
    const second = validator.validate(resource);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      code: 'security-validator-error',
      resourceType: 'DocumentReference',
      message:
        'Security sub-check "custom-pattern-detection" could not be completed because the validator encountered an operational error.',
      details: {
        checkName: 'custom-pattern-detection',
      },
    });
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('does not expose failed security-check exception details in issues or logs', () => {
    const sensitiveDetail =
      'https://user:secret@internal.example/security?token=private';
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      detectPHI: false,
      detectSensitiveIdentifiers: false,
      customPatterns: [
        { pattern: 'secret', name: 'Secret', severity: 'warning' },
      ],
    });
    const resource = {
      resourceType: 'DocumentReference',
      toJSON() {
        throw new Error(sensitiveDetail);
      },
    };

    const issues = validator.validate(resource);

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'security-validator-error',
      details: expect.objectContaining({
        checkName: 'custom-pattern-detection',
      }),
    }));
    expect(JSON.stringify(issues)).not.toContain(sensitiveDetail);
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveDetail);
  });

  it('does not accept a pipe character as part of an email top-level domain', () => {
    const validator = new SecurityValidator({
      ...SCAN_ONLY_CONFIG,
      piiLocale: 'all',
    });

    const issues = validator.validate({
      resourceType: 'Patient',
      text: { div: '<div>invalid@example.c|</div>' },
    });

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'security-phi-email-in-narrative',
    }));
  });
});
