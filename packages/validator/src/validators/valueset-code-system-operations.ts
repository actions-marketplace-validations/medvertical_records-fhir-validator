import type { FhirVersion } from './valueset-expansion-cache-key';
import type { ValueSetCache } from './valueset-cache';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import type { CodeSystemValidationResult, TerminologyApiClient } from './terminology-api-client';
import type { SubsumptionOutcome } from './terminology-api-types';
import {
  type TerminologyResolutionConfig,
  type TerminologyServerOverride,
  isExternalCodeSystem,
} from './valueset-types';
import {
  hasTerminologyServer,
  resolveTerminologyServerForSystem,
} from './valueset-server-routing';
import { validateCodeViaTerminologyServerWithFilters } from './valueset-terminology-server-validation';
import { validateCodeInCodeSystemWithFallbacks } from './valueset-code-system-validator';
import { buildUnverifiableCodeSystemResult } from './valueset-code-system-rules';
import { validateCodeInLocalCodeSystem } from './valueset-local-code-system-validation';
import { canDelegateCodeValidation } from './valueset-delegation-policy';

export class ValueSetCodeSystemOperations {
  constructor(private readonly dependencies: {
    apiClient: TerminologyApiClient;
    cache: ValueSetCache;
    getResolutionConfig: () => TerminologyResolutionConfig;
    packageLoader: ValueSetPackageLoader;
  }) {}

  isExternal(system: string): boolean {
    return isExternalCodeSystem(system);
  }

  resolveServer(system?: string): TerminologyServerOverride | undefined {
    return resolveTerminologyServerForSystem(this.dependencies.getResolutionConfig(), system);
  }

  hasServer(override?: { url: string }): boolean {
    const config = this.dependencies.getResolutionConfig();
    return canDelegateCodeValidation(config) && hasTerminologyServer(config, override);
  }

  async validateViaServer(options: {
    code: string;
    system?: string;
    valueSetUrl: string;
    bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example';
    override?: TerminologyServerOverride;
    fhirVersion?: FhirVersion;
  }): Promise<boolean> {
    const valid = await validateCodeViaTerminologyServerWithFilters({
      apiClient: this.dependencies.apiClient,
      packageLoader: this.dependencies.packageLoader,
      hasTerminologyServer: this.hasServer.bind(this),
      code: options.code,
      system: options.system,
      valueSetUrl: options.valueSetUrl,
      bindingStrength: options.bindingStrength,
      override: options.override,
      fhirVersion: options.fhirVersion,
    });
    return this.dependencies.apiClient.isValueSetNotResolvable(options.valueSetUrl, options.override)
      ? false
      : valid;
  }

  async validate(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult> {
    const localResult = await this.validateLocal(code, system, display, fhirVersion);
    const resolutionConfig = this.dependencies.getResolutionConfig();
    if (localResult) {
      return buildUnverifiableCodeSystemResult(code, system, localResult, resolutionConfig) ?? localResult;
    }
    if (!this.isExternal(system)) return { valid: true };
    if (!canDelegateCodeValidation(resolutionConfig)) return { valid: true };

    const result = await validateCodeInCodeSystemWithFallbacks({
      apiClient: this.dependencies.apiClient,
      code,
      display,
      primaryOverride: this.resolveServer(system),
      resolutionConfig,
      system,
    });
    return buildUnverifiableCodeSystemResult(code, system, result, resolutionConfig) ?? result;
  }

  validateLocal(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult | null> {
    return validateCodeInLocalCodeSystem(
      { cache: this.dependencies.cache, packageLoader: this.dependencies.packageLoader },
      code,
      system,
      display,
      fhirVersion,
    );
  }

  async resolveSubsumption(system: string, codeA: string, codeB: string): Promise<SubsumptionOutcome> {
    const override = this.resolveServer(system);
    if (!this.hasServer(override)) return 'unknown';
    return this.dependencies.apiClient.subsumes(system, codeA, codeB, override);
  }
}
