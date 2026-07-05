import { logger } from '../logger';
import type { CircuitBreaker } from '../terminology';
import type { TerminologyResolutionConfig } from './valueset-types';

export const DEFAULT_VALUESET_EXPAND_TIMEOUT_MS = 10000;
export const DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS = 5000;

const DEFAULT_SLOW_RESPONSE_THRESHOLD_MS = 2500;
const DEFAULT_MAX_REMOTE_CODE_SYSTEM_VALIDATIONS = 10;

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveEnvNumber(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env[name] : undefined;
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getRemoteTerminologyTimeoutMs(
  config: TerminologyResolutionConfig,
  fallback: number,
): number {
  return positiveNumber(
    config.serverDelegation?.requestTimeoutMs,
    positiveEnvNumber('VALIDATION_TERMINOLOGY_REQUEST_TIMEOUT_MS', fallback),
  );
}

function getSlowResponseThresholdMs(config: TerminologyResolutionConfig): number {
  return positiveNumber(
    config.serverDelegation?.slowResponseThresholdMs,
    positiveEnvNumber('VALIDATION_TERMINOLOGY_SLOW_RESPONSE_MS', DEFAULT_SLOW_RESPONSE_THRESHOLD_MS),
  );
}

export function getMaxRemoteCodeSystemValidations(config: TerminologyResolutionConfig): number {
  return positiveNumber(
    config.serverDelegation?.maxRemoteCodeSystemValidations,
    positiveEnvNumber(
      'VALIDATION_MAX_REMOTE_CODE_SYSTEM_VALIDATIONS',
      DEFAULT_MAX_REMOTE_CODE_SYSTEM_VALIDATIONS,
    ),
  );
}

export function recordTerminologyResponse(
  circuitBreaker: CircuitBreaker,
  config: TerminologyResolutionConfig,
  operation: string,
  serverUrl: string,
  startedAt: number,
): void {
  const durationMs = Date.now() - startedAt;
  const slowThresholdMs = getSlowResponseThresholdMs(config);
  if (slowThresholdMs > 0 && durationMs >= slowThresholdMs) {
    logger.warn(
      `[TerminologyApiClient] ${operation} on ${serverUrl} took ${durationMs}ms ` +
      `(threshold ${slowThresholdMs}ms); recording slow-response circuit failure`,
    );
    circuitBreaker.recordFailure();
    return;
  }

  circuitBreaker.recordSuccess();
}
