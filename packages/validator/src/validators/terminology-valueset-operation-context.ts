import type { TerminologyRequestConfigBuilder } from './terminology-api-request-config';
import type { TerminologyCircuitBreakerRegistry } from './terminology-circuit-breakers';
import type { TerminologyOperationCache } from './terminology-operation-cache';
import type { TerminologyRequestBroker } from './terminology-request-broker';
import type { ValueSetCache } from './valueset-cache';
import type { TerminologyResolutionConfig } from './valueset-types';

export interface TerminologyValueSetOperationsContext {
  cache: ValueSetCache;
  circuitBreakers: TerminologyCircuitBreakerRegistry;
  getConfig: () => TerminologyResolutionConfig;
  operationCache: TerminologyOperationCache;
  pendingValidateCodeRequests: Map<string, Promise<boolean>>;
  requestBroker: TerminologyRequestBroker;
  requestConfigBuilder: TerminologyRequestConfigBuilder;
}
