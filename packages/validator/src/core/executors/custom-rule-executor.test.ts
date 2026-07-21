import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCustomRulesSource } from '../../persistence';
import { CustomRuleExecutor } from './custom-rule-executor';

const context = {
  resource: { resourceType: 'Patient', id: 'p1' },
  structureDef: {} as never,
  organizationId: 7,
};

describe('custom rule source consistency', () => {
  afterEach(() => {
    vi.useRealTimers();
    setCustomRulesSource({ async getRulesByResourceType() { return []; } });
  });

  it('delegates cache ownership to the host and reloads on every execution', async () => {
    const getRulesByResourceType = vi.fn().mockResolvedValue([]);
    setCustomRulesSource({ getRulesByResourceType });
    const executor = new CustomRuleExecutor();

    await executor.validate(context);
    await executor.validate(context);

    expect(getRulesByResourceType).toHaveBeenCalledTimes(2);
  });

  it('marks validation incomplete when the rule source fails', async () => {
    setCustomRulesSource({
      async getRulesByResourceType() { throw new Error('database unavailable'); },
    });

    const issues = await new CustomRuleExecutor().validate(context);

    expect(issues).toEqual([expect.objectContaining({
      aspect: 'custom_rule',
      severity: 'warning',
      code: 'custom-rule-source-unavailable',
    })]);
  });

  it('marks validation incomplete when tenant scope is missing', async () => {
    const getRulesByResourceType = vi.fn().mockResolvedValue([]);
    setCustomRulesSource({ getRulesByResourceType });

    const issues = await new CustomRuleExecutor().validate({
      resource: context.resource,
      structureDef: context.structureDef,
    });

    expect(getRulesByResourceType).not.toHaveBeenCalled();
    expect(issues).toEqual([expect.objectContaining({
      code: 'custom-rule-source-unavailable',
      severity: 'warning',
      aspect: 'custom_rule',
    })]);
  });

  it('marks validation incomplete when rule loading exceeds its bound', async () => {
    vi.useFakeTimers();
    setCustomRulesSource({
      getRulesByResourceType: () => new Promise(() => undefined),
    });
    const validation = new CustomRuleExecutor().validate(context);

    await vi.advanceTimersByTimeAsync(250);

    await expect(validation).resolves.toEqual([expect.objectContaining({
      code: 'custom-rule-source-unavailable',
      severity: 'warning',
    })]);
  });
});
