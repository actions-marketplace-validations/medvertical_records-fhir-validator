import { describe, expect, it, vi } from 'vitest';
import { ProfileWarmupCoordinator } from '../profile-warmup-coordinator';

describe('ProfileWarmupCoordinator', () => {
  it('coalesces concurrent warmups and runs once per owner', async () => {
    const coordinator = new ProfileWarmupCoordinator();
    const warmup = vi.fn().mockResolvedValue({ warmedUp: 3, timeMs: 1 });

    await expect(Promise.all([
      coordinator.runOnce(warmup),
      coordinator.runOnce(warmup),
    ])).resolves.toEqual([
      { warmedUp: 3, timeMs: 1 },
      { warmedUp: 3, timeMs: 1 },
    ]);
    await expect(coordinator.runOnce(warmup)).resolves.toBeNull();
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  it('isolates owners and supports explicit lifecycle reset', async () => {
    const first = new ProfileWarmupCoordinator();
    const second = new ProfileWarmupCoordinator();
    const warmup = vi.fn().mockResolvedValue({ warmedUp: 0, timeMs: 0 });

    await first.runOnce(warmup);
    await second.runOnce(warmup);
    first.reset();
    await first.runOnce(warmup);

    expect(warmup).toHaveBeenCalledTimes(3);
  });
});
