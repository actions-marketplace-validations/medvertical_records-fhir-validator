import { describe, expect, it } from 'vitest';

import {
  getBundledProfilePlan,
  parseBundledProfilePreset,
} from '../defaults/bundled-profile-plan';

describe('bundled profile plan', () => {
  it('parses configured presets strictly while retaining the explicit default', () => {
    expect(parseBundledProfilePreset(undefined)).toBe('default');
    expect(parseBundledProfilePreset(' mii-2026 ')).toBe('mii-2026');
    expect(() => parseBundledProfilePreset('mii-2025'))
      .toThrow('Unsupported bundled profile preset: mii-2025');
  });

  it('includes the Rare Disease package and its owned Study dependency', () => {
    const plan = getBundledProfilePlan('mii-2026');
    const versions = new Map(plan.packages.map(pin => [pin.id, pin.version]));

    expect(versions.get('de.medizininformatikinitiative.kerndatensatz.seltene'))
      .toBe('2026.0.1');
    expect(versions.get('de.medizininformatikinitiative.kerndatensatz.studie'))
      .toBe('2026.0.2');
    expect(plan.ownedDependencyPrefixes)
      .toContain('de.medizininformatikinitiative.');
    expect(plan.requiredDependencyIds)
      .toContain('de.einwilligungsmanagement');
    expect(versions.get('de.einwilligungsmanagement')).toBe('2.0.3');
    expect(versions.get('de.medizininformatikinitiative.kerndatensatz.pros'))
      .toBe('2026.3.0');
  });
});
