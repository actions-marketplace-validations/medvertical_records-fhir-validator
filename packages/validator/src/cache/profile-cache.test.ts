import { describe, expect, it } from 'vitest';

import { ProfileCache } from './profile-cache';

describe('ProfileCache capacity', () => {
  it('evicts an old profile when the configured memory bound is reached', () => {
    const cache = new ProfileCache(true, 2);
    cache.set('a', { resourceType: 'StructureDefinition', url: 'a' } as never);
    cache.set('b', { resourceType: 'StructureDefinition', url: 'b' } as never);
    cache.set('c', { resourceType: 'StructureDefinition', url: 'c' } as never);

    expect(cache.getStats().size).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });
});
