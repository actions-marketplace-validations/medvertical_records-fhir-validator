import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'RECORDS_FHIR_VALIDATOR_LOG_LEVEL',
  'RECORDS_VALIDATOR_LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('engine logger default console implementation', () => {
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('suppresses lower-level console output by default', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();

    const { logger } = await import('../logger');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('error message');
  });

  it('honors an explicit validator log level for direct package use', async () => {
    process.env.RECORDS_VALIDATOR_LOG_LEVEL = 'debug';
    vi.resetModules();

    const { logger } = await import('../logger');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(debug).toHaveBeenCalledWith('debug message');
    expect(info).toHaveBeenCalledWith('info message');
    expect(warn).toHaveBeenCalledWith('warn message');
    expect(error).toHaveBeenCalledWith('error message');
  });

  it('lets embedders replace the default logger', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();

    const { logger, setEngineLogger } = await import('../logger');
    const calls: string[] = [];
    setEngineLogger({
      debug: () => calls.push('debug'),
      info: () => calls.push('info'),
      warn: () => calls.push('warn'),
      error: () => calls.push('error'),
    });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(calls).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
