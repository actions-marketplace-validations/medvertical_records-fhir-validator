import { describe, expect, it, vi } from 'vitest';

const SNOMED_SYSTEM = 'http://snomed.info/sct';
const UK_VERSION = 'http://snomed.info/sct/999000041000000102/version/20250701';
const UK_CODE = '35901911000001104';

describe('authoritative SNOMED edition validation', () => {
  it('keeps a declared edition rejection invalid and isolates it from fail-open cache entries', async () => {
    vi.resetModules();
    const get = vi.fn().mockResolvedValue({
      data: {
        resourceType: 'Parameters',
        parameter: [
          { name: 'result', valueBoolean: false },
          { name: 'message', valueString: 'Unknown code in requested UK edition' },
        ],
      },
    });
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: { ...actual.default, get },
        isAxiosError: actual.isAxiosError,
      };
    });
    const { TerminologyApiClient } = await import('../terminology-api-client');
    const url = 'https://uk-snomed.example/fhir';
    const client = new TerminologyApiClient({ strategy: 'server-first', serverUrl: url });

    const unverified = await client.validateCodeInCodeSystem(
      UK_CODE, SNOMED_SYSTEM, undefined, { url }, UK_VERSION,
    );
    const authoritative = await client.validateCodeInCodeSystem(
      UK_CODE,
      SNOMED_SYSTEM,
      undefined,
      { url, authoritativeSnomedEdition: true },
      UK_VERSION,
    );

    expect(unverified).toMatchObject({ valid: true, reason: 'national-extension-unverified' });
    expect(authoritative).toMatchObject({ valid: false, reason: 'code-unknown' });
    expect(get).toHaveBeenCalledTimes(2);
    vi.doUnmock('axios');
  });

  it('keeps an authoritative HTTP 422 rejection invalid', async () => {
    vi.resetModules();
    const error = Object.assign(new Error('Unprocessable Entity'), {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'code-invalid', diagnostics: 'Unknown code' }],
        },
      },
    });
    const get = vi.fn().mockRejectedValue(error);
    vi.doMock('axios', async () => {
      const actual = await vi.importActual<typeof import('axios')>('axios');
      return {
        ...actual,
        default: { ...actual.default, get },
        isAxiosError: actual.isAxiosError,
      };
    });
    const { TerminologyApiClient } = await import('../terminology-api-client');
    const url = 'https://uk-snomed.example/fhir';
    const client = new TerminologyApiClient({ strategy: 'server-first', serverUrl: url });

    const result = await client.validateCodeInCodeSystem(
      UK_CODE,
      SNOMED_SYSTEM,
      undefined,
      { url, authoritativeSnomedEdition: true },
      UK_VERSION,
    );

    expect(result).toMatchObject({ valid: false, reason: 'code-unknown' });
    expect(get).toHaveBeenCalledTimes(1);
    vi.doUnmock('axios');
  });
});
