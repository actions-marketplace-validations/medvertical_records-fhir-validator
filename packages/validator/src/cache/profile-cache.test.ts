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

  it('evicts by recent access instead of lifetime hit count', () => {
    const cache = new ProfileCache(true, 2);
    cache.set('a', { resourceType: 'StructureDefinition', url: 'a' } as never);
    cache.set('b', { resourceType: 'StructureDefinition', url: 'b' } as never);

    expect(cache.get('a')).not.toBeNull();
    cache.set('c', { resourceType: 'StructureDefinition', url: 'c' } as never);

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('keeps a safe bound when runtime configuration is invalid', () => {
    const cache = new ProfileCache(true, 2);
    cache.set('a', { resourceType: 'StructureDefinition', url: 'a' } as never);

    cache.setMaxSize(-1);
    cache.setTTL(Number.NaN);
    cache.set('b', { resourceType: 'StructureDefinition', url: 'b' } as never);
    cache.set('c', { resourceType: 'StructureDefinition', url: 'c' } as never);

    expect(cache.getStats()).toMatchObject({ size: 2, maxSize: 2, ttl: 3_600_000 });
  });

  it('does not evict another profile when replacing an existing key at capacity', () => {
    const cache = new ProfileCache(true, 2);
    cache.set('a', { resourceType: 'StructureDefinition', url: 'a' } as never);
    cache.set('b', { resourceType: 'StructureDefinition', url: 'b' } as never);
    cache.set('a', { resourceType: 'StructureDefinition', url: 'a', version: '2' } as never);

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(true);
  });
});
