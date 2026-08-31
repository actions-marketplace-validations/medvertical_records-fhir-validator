import { describe, expect, it, vi } from 'vitest';
import { ValueSetCache } from './valueset-cache';
import { ValueSetValidator } from './valueset-validator';
import { TerminologyExecutor } from '../core/executors/terminology-executor';

describe('ValueSetCache bounds', () => {
  it('evicts the least recently used entry in each cache domain', () => {
    const cache = new ValueSetCache(2);
    cache.setExpandedCodes('a', new Set(['a']));
    cache.setExpandedCodes('b', new Set(['b']));
    expect(cache.getExpandedCodes('a')).toEqual(new Set(['a']));

    cache.setExpandedCodes('c', new Set(['c']));

    expect(cache.getExpandedCodes('a')).toEqual(new Set(['a']));
    expect(cache.getExpandedCodes('b')).toBeUndefined();
    expect(cache.getExpandedCodes('c')).toEqual(new Set(['c']));
  });

  it('removes expired remote expansions instead of retaining stale entries', () => {
    vi.useFakeTimers();
    const cache = new ValueSetCache(2);
    cache.setServerExpansion('server|valueset', new Set(['one']));
    vi.advanceTimersByTime(2_000);

    expect(cache.getServerExpansion('server|valueset', 1)).toBeNull();
    expect(cache.getStats().serverExpansionCount).toBe(0);
    vi.useRealTimers();
  });
});

describe('ValueSetValidator cache ownership', () => {
  it('clears only the explicitly injected cache', () => {
    const firstCache = new ValueSetCache(2);
    const secondCache = new ValueSetCache(2);
    firstCache.setExpandedCodes('first', new Set(['A']));
    secondCache.setExpandedCodes('second', new Set(['B']));
    const firstValidator = new ValueSetValidator(firstCache);
    new ValueSetValidator(secondCache);

    firstValidator.clearCache();

    expect(firstCache.getExpandedCodes('first')).toBeUndefined();
    expect(secondCache.getExpandedCodes('second')).toEqual(new Set(['B']));
  });

  it('uses the executor cache when constructing its default validator', () => {
    const executorCache = new ValueSetCache(2);
    const independentCache = new ValueSetCache(2);
    executorCache.setExpandedCodes('executor-owned', new Set(['A']));
    independentCache.setExpandedCodes('independent', new Set(['B']));

    new TerminologyExecutor(undefined, executorCache).clearCache();

    expect(executorCache.getExpandedCodes('executor-owned')).toBeUndefined();
    expect(independentCache.getExpandedCodes('independent')).toEqual(new Set(['B']));
  });
});
