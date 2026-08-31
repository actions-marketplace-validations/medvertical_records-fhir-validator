import { describe, expect, it } from 'vitest';
import type { ValueSetValidator } from '../../../validators/valueset-validator';
import { validateDeepLocalCodings } from '../terminology-local-coding-rules';

describe('validateDeepLocalCodings', () => {
  it('terminates safely when an object graph contains a cycle', async () => {
    const resource: Record<string, unknown> = { resourceType: 'Observation' };
    resource.self = resource;

    const issues = await validateDeepLocalCodings(
      resource,
      [],
      {} as ValueSetValidator,
      'R4',
    );

    expect(issues).toEqual([]);
  });
});
