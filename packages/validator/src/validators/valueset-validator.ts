import type { Binding } from '../core/structure-definition-types';
import type { ValidationIssue } from '../types';
import type { CodeSystemValidationResult } from './terminology-api-client';
import type { SubsumptionOutcome } from './terminology-api-types';
import { TerminologyOperationCache } from './terminology-operation-cache';
import type { ValidateBindingOptions } from './valueset-binding-validator';
import { ValueSetCache } from './valueset-cache';
import type { BindingStrength } from './valueset-display-utils';
import type { FhirVersion } from './valueset-expansion-cache-key';
import {
  EXTERNAL_CODE_SYSTEMS,
  type CodeBindingOutcome,
  type TerminologyResolutionConfig,
} from './valueset-types';
import { ValueSetValidationPipeline } from './valueset-validation-pipeline';
import { ValueSetValidatorRuntime } from './valueset-validator-runtime';

export type {
  CodeSystem,
  TerminologyResolutionConfig,
  TerminologyResolutionStrategy,
  ValueSet,
} from './valueset-types';

export class ValueSetValidator {
  private readonly runtime: ValueSetValidatorRuntime;
  private readonly pipeline: ValueSetValidationPipeline;

  static readonly EXTERNAL_CODE_SYSTEMS = EXTERNAL_CODE_SYSTEMS;

  constructor(
    cache: ValueSetCache = new ValueSetCache(),
    operationCache: TerminologyOperationCache = new TerminologyOperationCache(),
  ) {
    this.runtime = new ValueSetValidatorRuntime(cache, operationCache);
    this.pipeline = new ValueSetValidationPipeline(
      this.runtime,
      () => this.apiClient,
      () => this.codeSystems,
      (...args) => this.resolveCodeBinding(...args),
    );
  }

  /** Retained as a private test seam for terminology transport regressions. */
  private get apiClient() { return this.runtime.apiClient; }

  /** Retained as a private test seam for local CodeSystem regressions. */
  private get codeSystems() { return this.runtime.codeSystems; }

  setResolutionConfig(config: Partial<TerminologyResolutionConfig>): void {
    this.runtime.setResolutionConfig(config);
  }

  getResolutionConfig(): TerminologyResolutionConfig {
    return this.runtime.getResolutionConfig();
  }

  getOperationCache(): TerminologyOperationCache {
    return this.runtime.operationCache;
  }

  registerExternalTerminologyResource(
    resource: unknown,
    fhirVersion: FhirVersion = 'R4',
  ): boolean {
    return this.runtime.registerExternalTerminologyResource(resource, fhirVersion);
  }

  async prewarmValueSet(valueSetUrl: string): Promise<void> {
    await this.pipeline.prewarmValueSet(valueSetUrl);
  }

  isExternalCodeSystem(system: string): boolean {
    return this.pipeline.isExternalCodeSystem(system);
  }

  async validateBinding(
    code: unknown,
    binding: Binding | undefined,
    elementPath: string,
    options?: ValidateBindingOptions,
  ): Promise<ValidationIssue[]> {
    return this.pipeline.validateBinding(code, binding, elementPath, options);
  }

  async isValueSetAvailable(
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return this.pipeline.isValueSetAvailable(valueSetUrl, fhirVersion);
  }

  async isCodeValidForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return this.pipeline.isCodeValidForBinding(
      code,
      system,
      valueSetUrl,
      bindingStrength,
      fhirVersion,
    );
  }

  /** Tri-state binding validation that distinguishes unverified from invalid. */
  async resolveCodeBindingForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
    codeSystemVersion?: string,
  ): Promise<CodeBindingOutcome> {
    return this.pipeline.resolveCodeBindingForBinding(
      code,
      system,
      valueSetUrl,
      bindingStrength,
      fhirVersion,
      elementPath,
      codeSystemVersion,
    );
  }

  async validateCodeInCodeSystem(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
    codeSystemVersion?: string,
  ): Promise<CodeSystemValidationResult> {
    return this.pipeline.validateCodeInCodeSystem(
      code,
      system,
      display,
      fhirVersion,
      codeSystemVersion,
    );
  }

  async validateCodeInLocalCodeSystemOnly(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
    codeSystemVersion?: string,
  ): Promise<CodeSystemValidationResult | null> {
    return this.pipeline.validateCodeInLocalCodeSystemOnly(
      code,
      system,
      display,
      fhirVersion,
      codeSystemVersion,
    );
  }

  async isCodeInValueSet(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return this.pipeline.isCodeInValueSet(code, system, valueSetUrl, fhirVersion);
  }

  async resolveCodeMembership(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    fhirVersion: FhirVersion,
  ): Promise<CodeBindingOutcome> {
    return this.pipeline.resolveCodeMembership(code, system, valueSetUrl, fhirVersion);
  }

  async resolveSubsumption(
    system: string,
    codeA: string,
    codeB: string,
  ): Promise<SubsumptionOutcome> {
    return this.pipeline.resolveSubsumption(system, codeA, codeB);
  }

  clearCache(): void {
    this.runtime.clearCache();
  }

  getCacheStats() {
    return this.runtime.getCacheStats();
  }

  async preloadCommonValueSets(): Promise<void> {
    await this.pipeline.preloadCommonValueSets();
  }

  /** Retained as a private test seam for binding singleflight and failure regressions. */
  private async resolveCodeBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
    codeSystemVersion?: string,
  ): Promise<CodeBindingOutcome> {
    return this.pipeline.resolveCodeBinding(
      code,
      system,
      valueSetUrl,
      bindingStrength,
      fhirVersion,
      elementPath,
      codeSystemVersion,
    );
  }
}
