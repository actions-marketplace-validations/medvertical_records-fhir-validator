import { logger } from '../logger';
import { terminologyTargetMetadata } from '../utils/sensitive-logging-metadata';
import {
  makeValidateCodeCacheKey,
  makeValueSetNotResolvableCacheKey,
} from './terminology-api-cache';
import { getMaxConcurrentRemoteTerminologyRequests } from './terminology-api-remote-policy';
import { runSingleFlight } from './terminology-pending-requests';
import { getTerminologyServerScope } from './terminology-server-scope';
import { executeValueSetValidateCodeRequest } from './terminology-valueset-validate-code-request';
import type { TerminologyValueSetOperationsContext } from './terminology-valueset-operation-context';
import { canDelegateCodeValidation } from './valueset-delegation-policy';
import type { TerminologyServerOverride } from './valueset-types';

export interface RemoteValueSetValidationInput {
  code: string;
  system?: string;
  valueSetUrl: string;
  bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example';
  override?: TerminologyServerOverride;
}

export async function validateCodeAgainstRemoteValueSet(
  context: TerminologyValueSetOperationsContext,
  input: RemoteValueSetValidationInput,
): Promise<boolean> {
  const config = context.getConfig();
  if (!canDelegateCodeValidation(config)) return false;
  const serverUrl = input.override?.url ?? config.serverUrl;
  if (!serverUrl) return false;
  const serverScope = getTerminologyServerScope(
    serverUrl,
    input.override?.auth ?? config.auth,
  );

  const valueSetNotResolvableKey = makeValueSetNotResolvableCacheKey(
    serverScope,
    input.valueSetUrl,
  );
  if (context.operationCache.getValueSetNotResolvable(valueSetNotResolvableKey)) {
    logger.debug(
      '[TerminologyApiClient] validate-code ValueSet not-resolvable cache hit',
      terminologyTargetMetadata(input.valueSetUrl),
    );
    return true;
  }

  const cacheKey = makeValidateCodeCacheKey(
    serverScope,
    input.system,
    input.code,
    input.valueSetUrl,
    input.bindingStrength,
  );
  const cached = context.operationCache.getValidateCode(cacheKey);
  if (cached !== undefined) {
    logger.debug('[TerminologyApiClient] validate-code cache hit', {
      ...terminologyTargetMetadata(input.system, input.code, input.valueSetUrl),
      cachedResult: cached,
    });
    return cached;
  }

  return runSingleFlight(
    context.pendingValidateCodeRequests,
    cacheKey,
    () => logger.debug(
      '[TerminologyApiClient] validate-code in-flight hit',
      terminologyTargetMetadata(input.system, input.code, input.valueSetUrl),
    ),
    async () => {
      const circuitBreaker = context.circuitBreakers.get(
        'valueset-validate-code',
        serverScope,
      );
      if (!(await circuitBreaker.allowRequest())) {
        logger.debug(
          '[TerminologyApiClient] $validate-code circuit open',
          terminologyTargetMetadata(serverUrl, input.system, input.code, input.valueSetUrl),
        );
        return false;
      }
      const requestConfig = context.getConfig();
      return executeValueSetValidateCodeRequest({
        bindingStrength: input.bindingStrength,
        cacheKey,
        circuitBreaker,
        code: input.code,
        config: requestConfig,
        override: input.override,
        requestConfigBuilder: context.requestConfigBuilder,
        operationCache: context.operationCache,
        serverScope,
        serverUrl,
        system: input.system,
        valueSetUrl: input.valueSetUrl,
      }, context.requestBroker, getMaxConcurrentRemoteTerminologyRequests(requestConfig));
    },
  );
}
