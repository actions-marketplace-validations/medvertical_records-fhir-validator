import { describe, expect, it } from 'vitest';

import { fingerprintPinnedCanonicals } from '../sd-loader-pinned-canonical';

describe('pinned canonical fingerprint', () => {
  it('is stable across insertion order and changes when a resolution changes', () => {
    const first = fingerprintPinnedCanonicals(new Map([
      ['http://example.org/Profile/A', 'http://example.org/Profile/A|1.0.0'],
      ['http://example.org/Profile/B', 'http://example.org/Profile/B|2.0.0'],
    ]));
    const reordered = fingerprintPinnedCanonicals(new Map([
      ['http://example.org/Profile/B', 'http://example.org/Profile/B|2.0.0'],
      ['http://example.org/Profile/A', 'http://example.org/Profile/A|1.0.0'],
    ]));
    const changed = fingerprintPinnedCanonicals(new Map([
      ['http://example.org/Profile/A', 'http://example.org/Profile/A|1.0.1'],
      ['http://example.org/Profile/B', 'http://example.org/Profile/B|2.0.0'],
    ]));

    expect(first).toEqual(reordered);
    expect(first.count).toBe(2);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.sha256).not.toBe(first.sha256);
  });
});
