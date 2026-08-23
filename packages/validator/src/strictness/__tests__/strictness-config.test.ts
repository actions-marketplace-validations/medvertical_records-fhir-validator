import { createDefaultValidationSettings } from '@records-fhir/validation-types';
import { describe, expect, it } from 'vitest';

import { resolveStrictnessConfig } from '../strictness-filter.js';

describe('resolveStrictnessConfig', () => {
  it('reads canonical settings without accepting arbitrary aspect names', () => {
    const settings = createDefaultValidationSettings('R4');
    settings.validationStrictness = 'strict';
    settings.aspects.terminology.severity = 'error';

    const config = resolveStrictnessConfig(settings);

    expect(config.strictness).toBe('strict');
    expect(config.aspectSeverityFor('terminology')).toBe('error');
    expect(config.aspectSeverityFor('prototype')).toBeUndefined();
  });

  it('uses standard strictness when settings are unavailable', () => {
    const config = resolveStrictnessConfig(undefined);

    expect(config.strictness).toBe('standard');
    expect(config.aspectSeverityFor('structural')).toBeUndefined();
  });
});
