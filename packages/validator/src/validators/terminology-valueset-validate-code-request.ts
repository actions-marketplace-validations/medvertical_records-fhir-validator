import axios, { isAxiosError } from 'axios';

import { logger } from '../logger';
import type { CircuitBreaker } from '../terminology';
import { makeValueSetNotResolvableCacheKey } from './terminology-api-cache';
import {
  DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS,
  getRemoteTerminologyTimeoutMs,
  recordTerminologyResponse,
} from './terminology-api-remote-policy';
import type { TerminologyRequestConfigBuilder } from './terminology-api-request-config';
import {
  operationOutcomeCannotResolveBinding,
  validateCodeSucceeded,
} from './terminology-parameters';
import type { TerminologyResolutionConfig, TerminologyServerOverride } from './valueset-types';
import type { TerminologyOperationCache } from './terminology-operation-cache';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import type { TerminologyRequestBroker } from './terminology-request-broker';

interface ValueSetValidateCodeRequest {
  bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example';
  cacheKey: string;
  circuitBreaker: CircuitBreaker;
  code: string;
  config: TerminologyResolutionConfig;
  override?: TerminologyServerOverride;
  operationCache: TerminologyOperationCache;
  requestConfigBuilder: TerminologyRequestConfigBuilder;
  serverScope: string;
  serverUrl: string;
  system?: string;
  valueSetUrl: string;
}

export async function executeValueSetValidateCodeRequest(
  request: ValueSetValidateCodeRequest,
  broker: TerminologyRequestBroker,
  maxConcurrency: number,
): Promise<boolean> {
  const {
    bindingStrength,
    cacheKey,
    circuitBreaker,
    code,
    config,
    override,
    operationCache,
    requestConfigBuilder,
    serverScope,
    serverUrl,
    system,
    valueSetUrl,
  } = request;
  try {
    const params: Record<string, string> = { url: valueSetUrl, code, _format: 'json' };
    if (system) params.system = system;
    let startedAt = Date.now();
    const response = await broker.run(
      serverScope,
      'valueset-validate-code',
      maxConcurrency,
      async () => {
        startedAt = Date.now();
        return axios.get(`${serverUrl}/ValueSet/$validate-code`, {
          ...(await requestConfigBuilder.build(
            override?.auth,
            getRemoteTerminologyTimeoutMs(config, DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS),
            params,
          )),
        });
      },
    );

    const valid = validateCodeSucceeded(response.data);
    recordTerminologyResponse(
      circuitBreaker,
      config,
      'ValueSet/$validate-code',
      serverUrl,
      startedAt,
    );
    operationCache.storeValidateCode(cacheKey, valid);
    return valid;
  } catch (error: unknown) {
    const axiosResponse = isAxiosError(error) ? error.response : undefined;
    logger.debug('[TerminologyApiClient] Server $validate-code failed', {
      ...validationFailureMetadata(error),
      ...(typeof axiosResponse?.status === 'number' ? { status: axiosResponse.status } : {}),
      hasResponseData: axiosResponse?.data !== undefined,
    });
    if (axiosResponse?.status === 422 || axiosResponse?.status === 404) {
      circuitBreaker.recordSuccess();
      const cannotResolve = operationOutcomeCannotResolveBinding(axiosResponse.data);
      const failOpen = cannotResolve || bindingStrength !== 'required';
      if (cannotResolve) {
        operationCache.storeValueSetNotResolvable(
          makeValueSetNotResolvableCacheKey(serverScope, valueSetUrl),
        );
      }
      operationCache.storeValidateCode(cacheKey, failOpen);
      return failOpen;
    }
    circuitBreaker.recordFailure();
    return false;
  }
}
