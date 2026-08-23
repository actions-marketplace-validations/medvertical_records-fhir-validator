import type { Binding } from '../core/structure-definition-types';
import type { ValidationIssue } from '../types';
import type {
  CodeSystemValidationResult,
  TerminologyApiClient,
} from './terminology-api-client';
import type { SubsumptionOutcome } from './terminology-api-types';
import type { BindingStrength } from './valueset-display-utils';
import { expandValueSet } from './valueset-expansion-loader';
import type { FhirVersion } from './valueset-expansion-cache-key';
import { validateValueSetMembership } from './valueset-membership-validator';
import { preloadCommonValueSets } from './valueset-cache-operations';
import {
  validateBinding as validateBindingFlow,
  type BindingValidationDeps,
  type ValidateBindingOptions,
} from './valueset-binding-validator';
import { resolveCodeBindingSafely as runSafeBindingResolution } from './valueset-binding-resolution-safety';
import { resolveValueSetCodeBinding } from './valueset-code-binding-resolver';
import type { ValueSetCodeSystemOperations } from './valueset-code-system-operations';
import { isValueSetAvailable as resolveValueSetAvailability } from './valueset-availability';
import type {
  CodeBindingOutcome,
  TerminologyServerOverride,
} from './valueset-types';
import type { ValueSetValidatorRuntime } from './valueset-validator-runtime';

type ResolveCodeBinding = (
  code: string,
  system: string | undefined,
  valueSetUrl: string,
  bindingStrength: BindingStrength,
  fhirVersion?: FhirVersion,
  elementPath?: string,
) => Promise<CodeBindingOutcome>;

/** Executes ValueSet validation use cases against one mutable runtime. */
export class ValueSetValidationPipeline {
  constructor(
    private readonly runtime: ValueSetValidatorRuntime,
    private readonly getApiClient: () => TerminologyApiClient,
    private readonly getCodeSystems: () => ValueSetCodeSystemOperations,
    private readonly resolveCodeBindingSeam: ResolveCodeBinding,
  ) {}

  async prewarmValueSet(valueSetUrl: string): Promise<void> {
    await this.runtime.packageLoader.loadValueSet(valueSetUrl);
  }

  isExternalCodeSystem(system: string): boolean {
    return this.getCodeSystems().isExternal(system);
  }

  async validateBinding(
    code: unknown,
    binding: Binding | undefined,
    elementPath: string,
    options?: ValidateBindingOptions,
  ): Promise<ValidationIssue[]> {
    return validateBindingFlow(this.bindingValidationDeps(), code, binding, elementPath, options);
  }

  async isValueSetAvailable(
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return resolveValueSetAvailability({
      getExpandedValueSet: this.getExpandedValueSet.bind(this),
      packageLoader: this.runtime.packageLoader,
    }, valueSetUrl, fhirVersion);
  }

  async isCodeValidForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return (await this.resolveCodeBindingForBinding(
      code,
      system,
      valueSetUrl,
      bindingStrength,
      fhirVersion,
    )) !== 'invalid';
  }

  async resolveCodeBindingForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    return this.runtime.bindingResolutions.run([
      fhirVersion ?? '',
      bindingStrength,
      valueSetUrl,
      system ?? '',
      code,
      elementPath ?? '',
    ], () => this.resolveCodeBindingSafely(
      code,
      system,
      valueSetUrl,
      bindingStrength,
      fhirVersion,
      elementPath,
    ));
  }

  async validateCodeInCodeSystem(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult> {
    return this.getCodeSystems().validate(code, system, display, fhirVersion);
  }

  async validateCodeInLocalCodeSystemOnly(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult | null> {
    return this.getCodeSystems().validateLocal(code, system, display, fhirVersion);
  }

  async isCodeInValueSet(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return validateValueSetMembership(
      {
        apiClient: this.getApiClient(),
        getExpandedValueSet: this.getExpandedValueSet.bind(this),
        packageLoader: this.runtime.packageLoader,
        resolutionConfig: this.runtime.resolutionConfig,
        terminologyDiagnostics: this.runtime.terminologyDiagnostics,
        twoPhaseShadow: this.runtime.twoPhaseShadow,
      },
      code,
      system,
      valueSetUrl,
      fhirVersion,
    );
  }

  async resolveCodeMembership(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    fhirVersion: FhirVersion,
  ): Promise<CodeBindingOutcome> {
    return this.resolveCodeBindingForBinding(
      code,
      system,
      valueSetUrl,
      'required',
      fhirVersion,
    );
  }

  async resolveSubsumption(
    system: string,
    codeA: string,
    codeB: string,
  ): Promise<SubsumptionOutcome> {
    return this.getCodeSystems().resolveSubsumption(system, codeA, codeB);
  }

  async preloadCommonValueSets(): Promise<void> {
    await preloadCommonValueSets(this.getExpandedValueSet.bind(this));
  }

  private bindingValidationDeps(): BindingValidationDeps {
    return {
      resolutionConfig: this.runtime.resolutionConfig,
      cache: this.runtime.cache,
      packageLoader: this.runtime.packageLoader,
      resolveCodeBindingForBinding: this.resolveCodeBindingForBinding.bind(this),
      isValueSetAvailable: this.isValueSetAvailable.bind(this),
    };
  }

  private resolveServerForSystem(system?: string): TerminologyServerOverride | undefined {
    return this.getCodeSystems().resolveServer(system);
  }

  private hasTerminologyServer(override?: { url: string }): boolean {
    return this.getCodeSystems().hasServer(override);
  }

  private async validateCodeViaTerminologyServer(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: 'required' | 'extensible' | 'preferred' | 'example' | undefined,
    override: TerminologyServerOverride | undefined,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return this.getCodeSystems().validateViaServer({
      code,
      system,
      valueSetUrl,
      bindingStrength,
      override,
      fhirVersion,
    });
  }

  private async resolveCodeBindingSafely(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    return runSafeBindingResolution(
      () => this.resolveCodeBindingSeam(
        code,
        system,
        valueSetUrl,
        bindingStrength,
        fhirVersion,
        elementPath,
      ),
      this.runtime.terminologyDiagnostics,
    );
  }

  async resolveCodeBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    return resolveValueSetCodeBinding({
      getExpandedValueSet: this.getExpandedValueSet.bind(this),
      hasTerminologyServer: this.hasTerminologyServer.bind(this),
      packageLoader: this.runtime.packageLoader,
      resolutionConfig: this.runtime.resolutionConfig,
      resolveServerForSystem: this.resolveServerForSystem.bind(this),
      terminologyDiagnostics: this.runtime.terminologyDiagnostics,
      twoPhaseShadow: this.runtime.twoPhaseShadow,
      validateViaServer: this.validateCodeViaTerminologyServer.bind(this),
    }, code, system, valueSetUrl, bindingStrength, fhirVersion, elementPath);
  }

  private getExpandedValueSet(
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<Set<string>> {
    return expandValueSet(
      {
        cache: this.runtime.cache,
        apiClient: this.getApiClient(),
        packageLoader: this.runtime.packageLoader,
        resolutionConfig: this.runtime.resolutionConfig,
      },
      valueSetUrl,
      fhirVersion,
    );
  }
}
