/**
 * Tests for the TerminologyApiClient $validate-code result cache (P-4).
 *
 * Covers cache exports only — the caching behaviour on real HTTP calls is
 * exercised indirectly by the integration tests that go through
 * `TerminologyApiClient.validateCode`. Here we lock the module-level
 * cache contract: size tracking + clear + TTL/LRU eviction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearValidateCodeCache,
  getValidateCodeCacheSize,
} from '../terminology-api-client';

describe('validate-code cache', () => {
  beforeEach(() => {
    clearValidateCodeCache();
  });

  it('is empty after clear', () => {
    expect(getValidateCodeCacheSize()).toBe(0);
  });

  it('tracks entries as the real validateCode flow writes them', async () => {
    // Exercise the cache indirectly via validateCode. We mock axios so the
    // "HTTP call" returns a deterministic Parameters result; each unique
    // (system, code, valueSet) tuple adds one entry.
    vi.resetModules();
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get: vi.fn().mockResolvedValue({
            data: {
              resourceType: 'Parameters',
              parameter: [{ name: 'result', valueBoolean: true }],
            },
          }),
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient, clearValidateCodeCache: clear, getValidateCodeCacheSize: size } =
      await import('../terminology-api-client');

    clear();
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    const a = await client.validateCode('A', 'http://x.sys', 'http://vs/1');
    expect(a).toBe(true);
    expect(size()).toBe(1);

    // Same tuple — hits the cache, no new entry.
    const a2 = await client.validateCode('A', 'http://x.sys', 'http://vs/1');
    expect(a2).toBe(true);
    expect(size()).toBe(1);

    // Different code — new entry.
    await client.validateCode('B', 'http://x.sys', 'http://vs/1');
    expect(size()).toBe(2);

    // Different valueSet — new entry.
    await client.validateCode('A', 'http://x.sys', 'http://vs/2');
    expect(size()).toBe(3);

    // Clear drops everything.
    clear();
    expect(size()).toBe(0);

    vi.doUnmock('axios');
  });

  it('coalesces concurrent validate-code requests for the same tuple', async () => {
    vi.resetModules();
    let resolveGet: ((value: unknown) => void) | undefined;
    const get = vi.fn().mockImplementation(() => new Promise(resolve => {
      resolveGet = resolve;
    }));

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient, clearValidateCodeCache: clear } =
      await import('../terminology-api-client');

    clear();
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    const first = client.validateCode('A', 'http://x.sys', 'http://vs/1');
    const second = client.validateCode('A', 'http://x.sys', 'http://vs/1');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    resolveGet?.({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }],
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(get).toHaveBeenCalledTimes(1);

    vi.doUnmock('axios');
  });

  it('short-circuits later codes when the server cannot resolve the ValueSet', async () => {
    vi.resetModules();
    const get = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          resourceType: 'OperationOutcome',
          issue: [{
            severity: 'error',
            code: 'not-found',
            details: { text: 'ValueSet could not be resolved' },
          }],
        },
      },
    });

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient, clearValidateCodeCache: clear } =
      await import('../terminology-api-client');

    clear();
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    expect(await client.validateCode('A', 'http://x.sys', 'http://vs/not-resolvable', 'required')).toBe(true);
    expect(await client.validateCode('B', 'http://x.sys', 'http://vs/not-resolvable', 'required')).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    vi.doUnmock('axios');
  });

  it('passes mTLS credentials through the terminology request agent', async () => {
    vi.resetModules();
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }],
      },
    });

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      serverUrl: 'https://ontoserver.example/fhir',
      strategy: 'server-first',
      auth: {
        type: 'mtls',
        clientCert: '-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----',
        clientKey: 'test-client-key-material',
        caCert: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----',
        rejectUnauthorized: false,
      },
    });

    await client.validateCode('A', 'http://loinc.org', 'http://vs/1');

    const requestConfig = get.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
      httpsAgent: { options: Record<string, unknown> };
    };
    expect(requestConfig.headers.Authorization).toBeUndefined();
    expect(requestConfig.headers.Accept).toBe('application/fhir+json');
    expect(requestConfig.httpsAgent.options.cert).toContain('cert');
    expect(requestConfig.httpsAgent.options.key).toContain('key');
    expect(requestConfig.httpsAgent.options.ca).toContain('ca');
    expect(requestConfig.httpsAgent.options.rejectUnauthorized).toBe(false);

    vi.doUnmock('axios');
  });

  it('opens the ValueSet validate-code circuit after transient failures', async () => {
    vi.resetModules();
    const get = vi.fn().mockRejectedValue(new Error('timeout of 5000ms exceeded'));

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    expect(await client.validateCode('A', 'http://x.sys', 'http://vs/1')).toBe(false);
    expect(await client.validateCode('B', 'http://x.sys', 'http://vs/1')).toBe(false);
    expect(await client.validateCode('C', 'http://x.sys', 'http://vs/1')).toBe(false);
    expect(get).toHaveBeenCalledTimes(3);

    expect(await client.validateCode('D', 'http://x.sys', 'http://vs/1')).toBe(false);
    expect(get).toHaveBeenCalledTimes(3);

    vi.doUnmock('axios');
  });

  it('opens the ValueSet validate-code circuit after slow successful responses', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const get = vi.fn().mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(5);
      return {
        data: {
          resourceType: 'Parameters',
          parameter: [{ name: 'result', valueBoolean: true }],
        },
      };
    });

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    try {
      const { TerminologyApiClient } = await import('../terminology-api-client');
      const client = new TerminologyApiClient({
        serverUrl: 'https://slow-tx.example.com/r4',
        strategy: 'server-first',
        serverDelegation: {
          expandValueSets: true,
          validateCodes: true,
          cacheResults: true,
          cacheTTLSeconds: 3600,
          slowResponseThresholdMs: 1,
        },
      });

      expect(await client.validateCode('A', 'http://x.sys', 'http://vs/1')).toBe(true);
      expect(await client.validateCode('B', 'http://x.sys', 'http://vs/1')).toBe(true);
      expect(await client.validateCode('C', 'http://x.sys', 'http://vs/1')).toBe(true);
      expect(get).toHaveBeenCalledTimes(3);

      expect(await client.validateCode('D', 'http://x.sys', 'http://vs/1')).toBe(false);
      expect(get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
      vi.doUnmock('axios');
    }
  });

  it('fails open for direct CodeSystem validation when no terminology server is configured', async () => {
    vi.resetModules();
    const get = vi.fn();

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      strategy: 'local-first',
    });

    const result = await client.validateCodeInCodeSystem(
      '77606-2',
      'http://loinc.org',
      'Weight-for-length Per age and sex',
    );

    expect(result).toEqual({ valid: true });
    expect(get).not.toHaveBeenCalled();

    vi.doUnmock('axios');
  });

  it('fails open after the remote CodeSystem validation budget is exhausted', async () => {
    vi.resetModules();
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }],
      },
    });

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
      serverDelegation: {
        expandValueSets: true,
        validateCodes: true,
        cacheResults: true,
        cacheTTLSeconds: 3600,
        maxRemoteCodeSystemValidations: 2,
      },
    });

    await client.validateCodeInCodeSystem('A', 'http://loinc.org');
    await client.validateCodeInCodeSystem('B', 'http://loinc.org');
    const exhaustedResult = await client.validateCodeInCodeSystem('C', 'http://loinc.org');

    expect(exhaustedResult).toMatchObject({
      valid: true,
      reason: 'remote-budget-exhausted',
    });
    expect(get).toHaveBeenCalledTimes(2);

    vi.doUnmock('axios');
  });

  it('coalesces concurrent direct CodeSystem validations before reserving remote budget', async () => {
    vi.resetModules();
    let resolveGet: ((value: unknown) => void) | undefined;
    const get = vi.fn().mockImplementation(() => new Promise(resolve => {
      resolveGet = resolve;
    }));

    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get,
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient } = await import('../terminology-api-client');
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
      serverDelegation: {
        expandValueSets: true,
        validateCodes: true,
        cacheResults: true,
        cacheTTLSeconds: 3600,
        maxRemoteCodeSystemValidations: 1,
      },
    });

    const first = client.validateCodeInCodeSystem('A', 'http://loinc.org');
    const second = client.validateCodeInCodeSystem('A', 'http://loinc.org');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    resolveGet?.({
      data: {
        resourceType: 'Parameters',
        parameter: [{ name: 'result', valueBoolean: true }],
      },
    });

    const results = await Promise.all([first, second]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ valid: true });
    expect(results[1]).toMatchObject({ valid: true });
    expect(get).toHaveBeenCalledTimes(1);

    const exhaustedResult = await client.validateCodeInCodeSystem('B', 'http://loinc.org');
    expect(exhaustedResult).toMatchObject({
      valid: true,
      reason: 'remote-budget-exhausted',
    });

    vi.doUnmock('axios');
  });

  it('is cleared by ValueSetValidator.clearCache for settings and tx-server changes', async () => {
    vi.resetModules();
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: {
          ...actual.default,
          get: vi.fn().mockResolvedValue({
            data: {
              resourceType: 'Parameters',
              parameter: [{ name: 'result', valueBoolean: true }],
            },
          }),
        },
        isAxiosError: actual.isAxiosError,
      };
    });

    const { TerminologyApiClient, getValidateCodeCacheSize: size } =
      await import('../terminology-api-client');
    const { ValueSetValidator } = await import('../valueset-validator');
    const client = new TerminologyApiClient({
      serverUrl: 'https://tx.example.com/r4',
      strategy: 'server-first',
    });

    await client.validateCode('A', 'http://x.sys', 'http://vs/1');
    expect(size()).toBe(1);

    const validator = new ValueSetValidator();
    expect(validator.getCacheStats().validateCodeResultCount).toBe(1);

    validator.clearCache();

    expect(size()).toBe(0);
    expect(validator.getCacheStats().validateCodeResultCount).toBe(0);

    vi.doUnmock('axios');
  });
});
