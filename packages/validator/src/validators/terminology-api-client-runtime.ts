import type { CodeSystemValidationOperationContext } from './terminology-code-system-validation-operation';
import { RemoteCodeSystemValidationBudget } from './terminology-api-remote-budget';
import { TerminologyRequestConfigBuilder } from './terminology-api-request-config';
import type {
  CodeSystemValidationResult,
  RemoteValueSetValidationResult,
  SubsumptionOutcome,
} from './terminology-api-types';
import { TerminologyCircuitBreakerRegistry } from './terminology-circuit-breakers';
import { TerminologyOperationCache } from './terminology-operation-cache';
import {
  sharedTerminologyRequestBroker,
  type TerminologyRequestBroker,
} from './terminology-request-broker';
import type { TerminologySubsumptionOperationContext } from './terminology-subsumption-operation';
import {
  snapshotTerminologyConfig,
  terminologyAuthConfigsEqual,
  terminologyConfigsEqual,
} from './terminology-config-snapshot';
import type { TerminologyValueSetOperationsContext } from './terminology-valueset-operations';
import { ValueSetCache } from './valueset-cache';
import type { TerminologyResolutionConfig } from './valueset-types';

/** Owns mutable request state shared by terminology API operations. */
export class TerminologyApiClientRuntime {
  private config: TerminologyResolutionConfig;
  private readonly requestConfigBuilder = new TerminologyRequestConfigBuilder(
    () => this.config.auth,
  );
  private readonly remoteCodeSystemBudget = new RemoteCodeSystemValidationBudget();
  private readonly pendingValidateCodeRequests = new Map<
    string,
    Promise<RemoteValueSetValidationResult>
  >();
  private readonly pendingSubsumesRequests = new Map<string, Promise<SubsumptionOutcome>>();
  private readonly pendingCodeSystemValidateCodeRequests = new Map<
    string,
    Promise<CodeSystemValidationResult>
  >();

  constructor(
    config: TerminologyResolutionConfig,
    private readonly cache: ValueSetCache = new ValueSetCache(),
    private readonly operationCache: TerminologyOperationCache = new TerminologyOperationCache(),
    private readonly circuitBreakers = new TerminologyCircuitBreakerRegistry(),
    private readonly requestBroker: TerminologyRequestBroker = sharedTerminologyRequestBroker,
  ) {
    this.config = snapshotTerminologyConfig(config);
  }

  setConfig(config: TerminologyResolutionConfig): void {
    const nextConfig = snapshotTerminologyConfig(config);
    if (terminologyConfigsEqual(this.config, nextConfig)) return;
    const authChanged = !terminologyAuthConfigsEqual(this.config.auth, nextConfig.auth);
    this.config = nextConfig;
    if (authChanged) this.requestConfigBuilder.resetAuthCache();
    this.remoteCodeSystemBudget.reset();
  }

  getConfig(): TerminologyResolutionConfig {
    return this.config;
  }

  valueSetOperationsContext(): TerminologyValueSetOperationsContext {
    return {
      cache: this.cache,
      circuitBreakers: this.circuitBreakers,
      getConfig: () => this.config,
      operationCache: this.operationCache,
      pendingValidateCodeRequests: this.pendingValidateCodeRequests,
      requestBroker: this.requestBroker,
      requestConfigBuilder: this.requestConfigBuilder,
    };
  }

  codeSystemValidationContext(): CodeSystemValidationOperationContext {
    return {
      config: this.config,
      circuitBreakers: this.circuitBreakers,
      operationCache: this.operationCache,
      pendingRequests: this.pendingCodeSystemValidateCodeRequests,
      remoteBudget: this.remoteCodeSystemBudget,
      requestBroker: this.requestBroker,
      requestConfigBuilder: this.requestConfigBuilder,
    };
  }

  subsumptionContext(): TerminologySubsumptionOperationContext {
    return {
      circuitBreakers: this.circuitBreakers,
      getConfig: () => this.config,
      operationCache: this.operationCache,
      pendingRequests: this.pendingSubsumesRequests,
      requestBroker: this.requestBroker,
      requestConfigBuilder: this.requestConfigBuilder,
    };
  }
}
