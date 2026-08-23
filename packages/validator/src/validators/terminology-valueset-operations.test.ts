import { describe, expect, it, vi } from 'vitest';

import type { TerminologyResolutionConfig } from './valueset-types';
import {
  type TerminologyValueSetOperationsContext,
  validateCodeAgainstRemoteValueSet,
} from './terminology-valueset-operations';

const requestMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('./terminology-valueset-validate-code-request', () => ({
  executeValueSetValidateCodeRequest: requestMocks.execute,
}));

describe('terminology ValueSet operations', () => {
  it('reads the latest config after waiting for the circuit breaker', async () => {
    const initialConfig = {
      strategy: 'server-first',
      serverUrl: 'https://tx.example.test',
    } as TerminologyResolutionConfig;
    const updatedConfig = {
      ...initialConfig,
      serverDelegation: { maxConcurrentRequests: 7 },
    } as TerminologyResolutionConfig;
    let config = initialConfig;
    let releaseCircuitBreaker!: (allowed: boolean) => void;
    const allowRequest = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseCircuitBreaker = resolve;
    }));
    const circuitBreaker = { allowRequest: allowRequest };
    const context = {
      cache: {},
      circuitBreakers: { get: vi.fn(() => circuitBreaker) },
      getConfig: () => config,
      operationCache: {
        getValidateCode: vi.fn(() => undefined),
        getValueSetNotResolvable: vi.fn(() => false),
      },
      pendingValidateCodeRequests: new Map(),
      requestBroker: {},
      requestConfigBuilder: {},
    } as unknown as TerminologyValueSetOperationsContext;
    requestMocks.execute.mockResolvedValueOnce(true);

    const result = validateCodeAgainstRemoteValueSet(context, {
      code: '123',
      system: 'https://codes.example.test',
      valueSetUrl: 'https://valuesets.example.test/example',
    });
    await vi.waitFor(() => expect(allowRequest).toHaveBeenCalledOnce());

    config = updatedConfig;
    releaseCircuitBreaker(true);

    await expect(result).resolves.toBe(true);
    expect(requestMocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ config: updatedConfig }),
      context.requestBroker,
      7,
    );
  });
});
