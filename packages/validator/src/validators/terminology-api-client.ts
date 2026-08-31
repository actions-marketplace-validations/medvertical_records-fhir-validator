/**
 * HTTP client facade for terminology server operations.
 */

import { TerminologyApiClientRuntime } from './terminology-api-client-runtime';
import type {
  CodeSystemValidationResult,
  RemoteValueSetValidationOutcome,
  SubsumptionOutcome,
} from './terminology-api-types';
import type { TerminologyCircuitBreakerRegistry } from './terminology-circuit-breakers';
import { validateCodeSystemRemotely } from './terminology-code-system-validation-operation';
import type { TerminologyOperationCache } from './terminology-operation-cache';
import type { TerminologyRequestBroker } from './terminology-request-broker';
import { executeRemoteSubsumption } from './terminology-subsumption-operation';
import {
  executeRemoteValueSetExpansion,
  isRemoteValueSetNotResolvable,
  validateCodeAgainstRemoteValueSet,
} from './terminology-valueset-operations';
import type { ValueSetCache } from './valueset-cache';
import { canDelegateCodeValidation } from './valueset-delegation-policy';
import type {
  TerminologyResolutionConfig,
  TerminologyServerOverride,
} from './valueset-types';

export type {
  CodeSystemValidationIssue,
  CodeSystemValidationResult,
  SubsumptionOutcome,
} from './terminology-api-types';
export { isSnomedNationalExtensionCode } from './terminology-code-system-result';

export class TerminologyApiClient {
  private readonly runtime: TerminologyApiClientRuntime;

  constructor(
    config: TerminologyResolutionConfig,
    cache?: ValueSetCache,
    operationCache?: TerminologyOperationCache,
    circuitBreakers?: TerminologyCircuitBreakerRegistry,
    requestBroker?: TerminologyRequestBroker,
  ) {
    this.runtime = new TerminologyApiClientRuntime(
      config,
      cache,
      operationCache,
      circuitBreakers,
      requestBroker,
    );
  }

  setConfig(config: TerminologyResolutionConfig): void {
    this.runtime.setConfig(config);
  }

  async expandValueSet(
    valueSetUrl: string,
    override?: TerminologyServerOverride,
  ): Promise<Set<string> | null> {
    return executeRemoteValueSetExpansion(
      this.runtime.valueSetOperationsContext(),
      valueSetUrl,
      override,
    );
  }

  async validateCode(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example',
    override?: TerminologyServerOverride,
    codeSystemVersion?: string,
  ): Promise<boolean> {
    const result = await validateCodeAgainstRemoteValueSet(
      this.runtime.valueSetOperationsContext(),
      { code, system, valueSetUrl, bindingStrength, override, codeSystemVersion },
    );
    return result.accepted;
  }

  async validateCodeOutcome(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example',
    override?: TerminologyServerOverride,
    codeSystemVersion?: string,
  ): Promise<RemoteValueSetValidationOutcome> {
    const result = await validateCodeAgainstRemoteValueSet(
      this.runtime.valueSetOperationsContext(),
      { code, system, valueSetUrl, bindingStrength, override, codeSystemVersion },
    );
    return result.outcome;
  }

  isValueSetNotResolvable(
    valueSetUrl: string,
    override?: TerminologyServerOverride,
    system?: string,
    codeSystemVersion?: string,
  ): boolean {
    return isRemoteValueSetNotResolvable(
      this.runtime.valueSetOperationsContext(),
      valueSetUrl,
      override,
      system,
      codeSystemVersion,
    );
  }

  async validateCodeInCodeSystem(
    code: string,
    system: string,
    display?: string,
    override?: TerminologyServerOverride,
    codeSystemVersion?: string,
  ): Promise<CodeSystemValidationResult> {
    if (!canDelegateCodeValidation(this.runtime.getConfig())) return { valid: true };
    return validateCodeSystemRemotely(
      this.runtime.codeSystemValidationContext(),
      code,
      system,
      display,
      override,
      codeSystemVersion,
    );
  }

  async subsumes(
    system: string,
    codeA: string,
    codeB: string,
    override?: TerminologyServerOverride,
  ): Promise<SubsumptionOutcome> {
    return executeRemoteSubsumption(
      this.runtime.subsumptionContext(),
      { codeA, codeB, system, override },
    );
  }

  async isSubsumedBy(
    system: string,
    child: string,
    parent: string,
    override?: TerminologyServerOverride,
  ): Promise<boolean> {
    const outcome = await this.subsumes(system, parent, child, override);
    return outcome === 'subsumes' || outcome === 'equivalent';
  }
}
