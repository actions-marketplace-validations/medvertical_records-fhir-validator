import { describe, expect, it, vi } from 'vitest';

import type { TerminologyResolutionConfig } from './valueset-types';
import {
  executeRemoteSubsumption,
  type TerminologySubsumptionOperationContext,
} from './terminology-subsumption-operation';

const requestMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('./terminology-subsumes-request', () => ({
  executeSubsumesRequest: requestMocks.execute,
}));

describe('terminology subsumption operation', () => {
  it('reads live config after both the circuit-breaker and broker queues', async () => {
    const initialConfig = {
      strategy: 'server-first',
      serverUrl: 'https://tx.example.test',
    } as TerminologyResolutionConfig;
    const brokerConfig = {
      ...initialConfig,
      serverDelegation: { maxConcurrentRequests: 7 },
    } as TerminologyResolutionConfig;
    const requestConfig = {
      ...brokerConfig,
      serverDelegation: {
        ...brokerConfig.serverDelegation,
        requestTimeoutMs: 3210,
      },
    } as TerminologyResolutionConfig;
    let config = initialConfig;
    let releaseCircuitBreaker!: (allowed: boolean) => void;
    let releaseBroker!: () => void;
    const allowRequest = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseCircuitBreaker = resolve;
    }));
    const run = vi.fn(async (
      _serverScope: string,
      _operation: string,
      _maxConcurrency: number,
      task: () => Promise<unknown>,
    ) => {
      await new Promise<void>((resolve) => {
        releaseBroker = resolve;
      });
      return task();
    });
    const context = {
      circuitBreakers: { get: vi.fn(() => ({ allowRequest })) },
      getConfig: () => config,
      operationCache: {
        getSubsumes: vi.fn(() => undefined),
      },
      pendingRequests: new Map(),
      requestBroker: { run },
      requestConfigBuilder: {},
    } as unknown as TerminologySubsumptionOperationContext;
    requestMocks.execute.mockResolvedValueOnce('subsumes');

    const result = executeRemoteSubsumption(context, {
      codeA: 'parent',
      codeB: 'child',
      system: 'https://codes.example.test',
    });
    await vi.waitFor(() => expect(allowRequest).toHaveBeenCalledOnce());

    config = brokerConfig;
    releaseCircuitBreaker(true);
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(run).toHaveBeenCalledWith(
      expect.any(String),
      'codesystem-subsumes',
      7,
      expect.any(Function),
    );

    config = requestConfig;
    releaseBroker();

    await expect(result).resolves.toBe('subsumes');
    expect(requestMocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ config: requestConfig }),
    );
  });
});
