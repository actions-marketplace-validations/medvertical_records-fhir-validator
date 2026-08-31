import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setTerminologyBrokerObserver,
  TerminologyRequestBroker,
} from './terminology-request-broker';

afterEach(() => {
  setTerminologyBrokerObserver(undefined);
});

describe('TerminologyRequestBroker', () => {
  it('bounds concurrency per server and preserves FIFO start order', async () => {
    const broker = new TerminologyRequestBroker();
    const releases: Array<() => void> = [];
    const started: number[] = [];
    let active = 0;
    let peakActive = 0;

    const requests = Array.from({ length: 5 }, (_, index) => broker.run(
      'server-a',
      'valueset-validate-code',
      2,
      async () => {
        started.push(index);
        active++;
        peakActive = Math.max(peakActive, active);
        await new Promise<void>(resolve => releases.push(resolve));
        active--;
        return index;
      },
    ));

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]));
    while (releases.length > 0) releases.shift()?.();

    await expect(Promise.all(requests)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peakActive).toBe(2);
    expect(broker.getStats('server-a')).toEqual({ active: 0, queued: 0 });
  });

  it('does not let one server consume another server concurrency budget', async () => {
    const broker = new TerminologyRequestBroker();
    let releaseA: (() => void) | undefined;
    let startedB = false;

    const requestA = broker.run('server-a', 'valueset-expand', 1, async () => {
      await new Promise<void>(resolve => { releaseA = resolve; });
      return 'a';
    });
    const requestB = broker.run('server-b', 'valueset-expand', 1, async () => {
      startedB = true;
      return 'b';
    });

    await expect(requestB).resolves.toBe('b');
    expect(startedB).toBe(true);
    releaseA?.();
    await expect(requestA).resolves.toBe('a');
  });

  it('reports queue wait and remaining depth without exposing server identity', async () => {
    const broker = new TerminologyRequestBroker();
    const observations: Array<{ queueDepth: number; queueWaitMs: number }> = [];
    setTerminologyBrokerObserver(({ queueDepth, queueWaitMs }) => {
      observations.push({ queueDepth, queueWaitMs });
    });
    let release: (() => void) | undefined;

    const first = broker.run('secret-server-scope', 'codesystem-subsumes', 1, async () => {
      await new Promise<void>(resolve => { release = resolve; });
    });
    const second = broker.run('secret-server-scope', 'codesystem-subsumes', 1, async () => undefined);

    await vi.waitFor(() => expect(broker.getStats('secret-server-scope').queued).toBe(1));
    release?.();
    await Promise.all([first, second]);

    expect(observations).toHaveLength(2);
    expect(observations[1]?.queueDepth).toBe(0);
    expect(observations[1]?.queueWaitMs).toBeGreaterThanOrEqual(0);
  });
});
