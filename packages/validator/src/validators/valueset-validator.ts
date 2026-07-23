import type { ValidationIssue } from '../types';
import type { Binding } from '../core/structure-definition-types';
import { logger } from '../logger';

import type {
  TerminologyResolutionConfig,
  CodeBindingOutcome,
  TerminologyDiagnostics,
} from './valueset-types';
import {
  DEFAULT_RESOLUTION_CONFIG,
  isExternalCodeSystem,
  EXTERNAL_CODE_SYSTEMS
} from './valueset-types';
import {
  type BindingStrength,
  displaysEquivalentForCodeInfo,
} from './valueset-display-utils';
import { type FhirVersion } from './valueset-expansion-cache-key';
import { KNOWN_VALUE_SET_EXPANSIONS } from './valueset-known-expansions';
import { isLanguageBinding, validateBCP47 } from './valueset-language-utils';
import { ValueSetCache, valueSetCache } from './valueset-cache';
import {
  TerminologyApiClient,
  clearCodeSystemValidateCodeCache,
  clearSubsumesCache,
  clearValidateCodeCache,
  getSubsumesCacheSize,
  getValidateCodeCacheSize,
  type CodeSystemValidationResult
} from './terminology-api-client';
import { ValueSetPackageLoader } from './valueset-package-loader';
import {
  hasTerminologyServer,
  resolveTerminologyServerForSystem,
} from './valueset-server-routing';
import { TwoPhaseShadowEvaluator } from './valueset-two-phase-shadow';
import {
  classifyUnverifiableFilterReason,
} from './valueset-filter-checks';
import { expandValueSet } from './valueset-expansion-loader';
import { validateCodeInCodeSystemWithFallbacks } from './valueset-code-system-validator';
import {
  validateBinding as validateBindingFlow,
  type BindingValidationDeps,
  type ValidateBindingOptions,
} from './valueset-binding-validator';
import { isMimeTypesValueSet, validateMimeTypeBindingCode } from './valueset-mimetype-utils';
import {
  cloneTerminologyDiagnostics,
  createEmptyTerminologyDiagnostics,
  recordTerminologyDelegation,
  recordTerminologyReason,
} from './valueset-diagnostics';
import { validateCodeViaTerminologyServerWithFilters } from './valueset-terminology-server-validation';
import { EpochSingleflight } from './epoch-singleflight';
import {
  buildUnverifiableCodeSystemResult,
  fhirVersionToPackageMajor,
  findCodeSystemConcept,
  isAssertableCodeSystem,
} from './valueset-code-system-rules';

export type { TerminologyResolutionStrategy, TerminologyResolutionConfig, ValueSet, CodeSystem } from './valueset-types';

export class ValueSetValidator {
  private resolutionConfig: TerminologyResolutionConfig;
  private cache: ValueSetCache;
  private apiClient: TerminologyApiClient;
  private packageLoader: ValueSetPackageLoader;
  private twoPhaseShadow: TwoPhaseShadowEvaluator;
  private terminologyDiagnostics: TerminologyDiagnostics = createEmptyTerminologyDiagnostics();
  private bindingResolutions = new EpochSingleflight<CodeBindingOutcome>();

  static readonly EXTERNAL_CODE_SYSTEMS = EXTERNAL_CODE_SYSTEMS;

  constructor() {
    this.resolutionConfig = { ...DEFAULT_RESOLUTION_CONFIG };
    this.cache = valueSetCache;
    this.apiClient = new TerminologyApiClient(this.resolutionConfig, this.cache);
    this.packageLoader = new ValueSetPackageLoader(this.cache);
    this.twoPhaseShadow = new TwoPhaseShadowEvaluator(
      this.packageLoader,
      this.resolutionConfig.twoPhaseExpansion,
    );
  }

  /**
   * Configure the terminology resolution strategy
   */
  setResolutionConfig(config: Partial<TerminologyResolutionConfig>): void {
    const { serverDelegation, ...rest } = config;
    this.resolutionConfig = {
      ...this.resolutionConfig,
      ...rest,
      ...(serverDelegation !== undefined
        ? {
          serverDelegation: {
            ...this.resolutionConfig.serverDelegation,
            ...serverDelegation,
          },
        }
        : {}),
    };
    this.apiClient.setConfig(this.resolutionConfig);
    this.twoPhaseShadow.setConfig(this.resolutionConfig.twoPhaseExpansion);
    this.bindingResolutions.advanceEpoch();
    const twoPhase = this.resolutionConfig.twoPhaseExpansion?.enabled
      ? this.resolutionConfig.twoPhaseExpansion.mode
      : 'off';
    logger.info(`[ValueSetValidator] Resolution config updated: strategy=${this.resolutionConfig.strategy}, twoPhase=${twoPhase}`);
  }

  /**
   * Get current resolution config
   */
  getResolutionConfig(): TerminologyResolutionConfig {
    return { ...this.resolutionConfig };
  }

  /**
   * Check if a CodeSystem requires external validation
   */
  isExternalCodeSystem(system: string): boolean {
    return isExternalCodeSystem(system);
  }

  private resolveServerForSystem(system?: string): { url: string; auth?: any } | undefined {
    return resolveTerminologyServerForSystem(this.resolutionConfig, system);
  }

  private hasTerminologyServer(override?: { url: string }): boolean {
    return hasTerminologyServer(this.resolutionConfig, override);
  }

  private async validateCodeViaTerminologyServer(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: 'required' | 'extensible' | 'preferred' | 'example' | undefined,
    override: { url: string; auth?: any } | undefined,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return validateCodeViaTerminologyServerWithFilters({
      apiClient: this.apiClient,
      packageLoader: this.packageLoader,
      hasTerminologyServer: this.hasTerminologyServer.bind(this),
      code,
      system,
      valueSetUrl,
      bindingStrength,
      override,
      fhirVersion,
    });
  }

  /**
   * Validate a coded element against its binding
   */
  async validateBinding(
    code: any,
    binding: Binding | undefined,
    elementPath: string,
    options?: ValidateBindingOptions,
  ): Promise<ValidationIssue[]> {
    return validateBindingFlow(this.bindingValidationDeps(), code, binding, elementPath, options);
  }

  private bindingValidationDeps(): BindingValidationDeps {
    return {
      resolutionConfig: this.resolutionConfig,
      cache: this.cache,
      packageLoader: this.packageLoader,
      resolveCodeBindingForBinding: this.resolveCodeBindingForBinding.bind(this),
    };
  }

  async isCodeValidForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    return (await this.resolveCodeBindingForBinding(code, system, valueSetUrl, bindingStrength, fhirVersion)) !== 'invalid';
  }

  /**
   * Tri-state variant of {@link isCodeValidForBinding}. Distinguishes
   * `unverified` (could not confirm) from `valid`, so callers can surface a
   * visible informational issue instead of silently failing open (gap P-3).
   */
  async resolveCodeBindingForBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    return this.bindingResolutions.run([
      fhirVersion ?? '', bindingStrength, valueSetUrl,
      system ?? '', code, elementPath ?? '',
    ], () => this.resolveCodeBindingSafely(
      code, system, valueSetUrl, bindingStrength, fhirVersion, elementPath,
    ));
  }

  private async resolveCodeBindingSafely(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    try {
      return await this.resolveCodeBinding(code, system, valueSetUrl, bindingStrength, fhirVersion, elementPath);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      // A resolver failure is absence of evidence, never evidence that the
      // code is outside a required ValueSet. Keep the tri-state contract for
      // every binding strength so infrastructure/package failures cannot
      // create false clinical errors.
      logger.warn(`[ValueSetValidator] Binding validation failed, treating as unverified: ${err.message}`);
      recordTerminologyReason(this.terminologyDiagnostics.unverifiedBindings, 'validation-error');
      return 'unverified';
    }
  }

  /**
   * Validate a code directly against a CodeSystem using tx.fhir.org
   */
  async validateCodeInCodeSystem(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult> {
    const localResult = await this.validateCodeInLocalCodeSystem(code, system, display, fhirVersion);
    if (localResult) {
      return buildUnverifiableCodeSystemResult(
        code,
        system,
        localResult,
        this.resolutionConfig,
      ) ?? localResult;
    }

    if (!this.isExternalCodeSystem(system)) {
      return { valid: true };
    }
    // Scope-based routing: if settings configure a server preferred for
    // this system, call THAT server instead of the default. Otherwise
    // pass undefined and the api client uses its default serverUrl.
    const override = this.resolveServerForSystem(system);
    const result = await validateCodeInCodeSystemWithFallbacks({
      apiClient: this.apiClient,
      code,
      display,
      primaryOverride: override,
      resolutionConfig: this.resolutionConfig,
      system,
    });
    return buildUnverifiableCodeSystemResult(
      code,
      system,
      result,
      this.resolutionConfig,
    ) ?? result;
  }

  /**
   * Validate against an installed CodeSystem only. This is used by the deep
   * Coding walk for datatype children that are not expanded into a resource
   * StructureDefinition snapshot. It must never trigger a remote terminology
   * request merely because a nested Coding exists.
   */
  async validateCodeInLocalCodeSystemOnly(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult | null> {
    return this.validateCodeInLocalCodeSystem(code, system, display, fhirVersion);
  }

  private async validateCodeInLocalCodeSystem(
    code: string,
    system: string,
    display?: string,
    fhirVersion?: FhirVersion,
  ): Promise<CodeSystemValidationResult | null> {
    const codeSystem = this.cache.getCodeSystem(system)
      ?? this.cache.getCodeSystemFile(system)
      ?? await this.packageLoader.loadCodeSystem(system, fhirVersionToPackageMajor(fhirVersion));
    if (!codeSystem || !isAssertableCodeSystem(codeSystem)) return null;

    const concept = findCodeSystemConcept(codeSystem.concept, code);
    if (!concept) {
      const incompleteCodeSystem = codeSystem.content === 'fragment';
      return {
        valid: false,
        reason: 'code-unknown',
        incompleteCodeSystem,
        message:
          `Unknown code '${code}' in CodeSystem '${system}'` +
          `${codeSystem.version ? ` version '${codeSystem.version}'` : ''}` +
          (incompleteCodeSystem
            ? '; the CodeSystem is a fragment, so the code may exist in another fragment'
            : ''),
      };
    }

    const acceptedDisplays = [
      concept.display,
      ...(concept.designation ?? []).map(designation => designation.value),
    ].filter((value): value is string => Boolean(value?.trim()));

    if (
      display &&
      acceptedDisplays.length > 0 &&
      !acceptedDisplays.some(expected => displaysEquivalentForCodeInfo(expected, display, { code, system }))
    ) {
      const expectedDisplay = acceptedDisplays[0];
      return {
        valid: false,
        reason: 'display-mismatch',
        display: expectedDisplay,
        message: `Wrong Display Name '${display}' for ${system}#${code}. Valid display is '${expectedDisplay}'`,
        issues: [{
          severity: 'error',
          code: 'invalid-display',
          message: `Wrong Display Name '${display}' for ${system}#${code}. Valid display is '${expectedDisplay}'`,
          source: 'local-code-system',
        }],
      };
    }

    return { valid: true, display: concept.display };
  }

  /**
   * Check if a code is in a value set
   */
  async isCodeInValueSet(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    try {
      if (isLanguageBinding(valueSetUrl, system)) {
        return validateBCP47(code);
      }

      const twoPhaseLookup = await this.twoPhaseShadow.lookup(code, system, valueSetUrl, fhirVersion);
      const enforcedTwoPhaseResult = this.twoPhaseShadow.getEnforcedResult(twoPhaseLookup);
      if (enforcedTwoPhaseResult !== undefined) {
        return this.twoPhaseShadow.finish(twoPhaseLookup, enforcedTwoPhaseResult, { code, system, valueSetUrl });
      }

      const expandedCodes = await this.getExpandedValueSet(valueSetUrl, fhirVersion);

      const fullCode = system ? `${system}|${code}` : code;
      const isInExpansion = expandedCodes.has(fullCode) || expandedCodes.has(code);

      if (isInExpansion) {
        return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl });
      }

      // Try server validation as fallback
      const override = this.resolveServerForSystem(system);
      if (this.hasTerminologyServer(override) && (expandedCodes.size === 0 || this.resolutionConfig.serverDelegation?.validateCodes)) {
        logger.debug(`[ValueSetValidator] Code not found in local expansion for ${valueSetUrl}. Attempting server $validate-code...`);
        recordTerminologyDelegation(this.terminologyDiagnostics.delegatedBindings, 'server-validate-code');
        const isValidOnServer = await this.validateCodeViaTerminologyServer(
          code,
          system,
          valueSetUrl,
          undefined,
          override,
          fhirVersion,
        );
        if (isValidOnServer) {
          return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl });
        }
      }

      const filteredIncludes = await this.packageLoader.getIncludeConceptFilters(valueSetUrl, fhirVersion);
      const unverifiableReason = classifyUnverifiableFilterReason(system, code, filteredIncludes);
      if (unverifiableReason) {
        logger.debug(
          `[ValueSetValidator] Unverifiable include filter (${unverifiableReason}) in ${valueSetUrl} ` +
          `for '${system ? `${system}|` : ''}${code}' – direct ValueSet membership cannot be verified locally`,
        );
        recordTerminologyReason(this.terminologyDiagnostics.failOpenMembershipChecks, unverifiableReason);
        return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl });
      }

      return this.twoPhaseShadow.finish(twoPhaseLookup, false, { code, system, valueSetUrl });

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[ValueSetValidator] Could not validate code against ${valueSetUrl}:`, err.message);
      recordTerminologyReason(this.terminologyDiagnostics.failOpenMembershipChecks, 'validation-error');
      return true; // Fail open
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.packageLoader.clearLookupState();
    clearValidateCodeCache();
    clearCodeSystemValidateCodeCache();
    clearSubsumesCache();
    this.twoPhaseShadow.clearExpansion();
    this.bindingResolutions.clear();
    this.terminologyDiagnostics = createEmptyTerminologyDiagnostics();
    logger.debug('[ValueSetValidator] Cache cleared');
  }

  getCacheStats(): {
    valueSetCount: number;
    codeSystemCount: number;
    validateCodeResultCount: number;
    subsumesResultCount: number;
    terminologyDiagnostics: TerminologyDiagnostics;
    twoPhaseExpansion?: {
      lookups: number;
      hits: number;
      misses: number;
      unknown: number;
      mismatches: number;
      enforced: number;
    };
  } {
    const stats = this.cache.getStats();
    return {
      valueSetCount: stats.valueSetCount,
      codeSystemCount: stats.codeSystemCount,
      validateCodeResultCount: getValidateCodeCacheSize(),
      subsumesResultCount: getSubsumesCacheSize(),
      terminologyDiagnostics: cloneTerminologyDiagnostics(this.terminologyDiagnostics),
      twoPhaseExpansion: this.twoPhaseShadow.getStats(),
    };
  }

  /**
   * Preload common value sets
   */
  async preloadCommonValueSets(): Promise<void> {
    logger.info('[ValueSetValidator] Preloading common value sets...');

    const commonValueSets = Object.keys(KNOWN_VALUE_SET_EXPANSIONS);

    for (const vsUrl of commonValueSets) {
      await this.getExpandedValueSet(vsUrl);
    }

    logger.info(`[ValueSetValidator] Preloaded ${commonValueSets.length} common value sets`);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Tri-state code-vs-binding check. `valid`/`invalid` are authoritative;
   * `unverified` means the code is not known to be wrong but could not be
   * confirmed (no local expansion, terminology-server-only filters, or empty
   * expansion). Callers fail open on `unverified` but may surface it as an
   * informational issue (gap P-3).
   */
  private async resolveCodeBinding(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
    elementPath?: string,
  ): Promise<CodeBindingOutcome> {
    if (isLanguageBinding(valueSetUrl, system)) {
      return validateBCP47(code) ? 'valid' : 'invalid';
    }

    if (isMimeTypesValueSet(valueSetUrl)) {
      return validateMimeTypeBindingCode(code, system, elementPath) ? 'valid' : 'invalid';
    }

    const twoPhaseLookup = await this.twoPhaseShadow.lookup(code, system, valueSetUrl, fhirVersion);
    const enforcedTwoPhaseResult = this.twoPhaseShadow.getEnforcedResult(twoPhaseLookup);
    if (enforcedTwoPhaseResult !== undefined) {
      return this.twoPhaseShadow.finish(twoPhaseLookup, enforcedTwoPhaseResult, { code, system, valueSetUrl })
        ? 'valid' : 'invalid';
    }

    const expandedCodes = await this.getExpandedValueSet(valueSetUrl, fhirVersion);

    const fullCode = system ? `${system}|${code}` : code;

    // Strict matching for required bindings when system is provided
    if (bindingStrength === 'required' && system) {
      if (expandedCodes.has(fullCode)) {
        return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl }) ? 'valid' : 'invalid';
      }
      logger.debug(`[ValueSetValidator] Required binding: system|code '${fullCode}' not in expansion.`);
    } else {
      const isInExpansion = expandedCodes.has(fullCode) || expandedCodes.has(code);
      if (isInExpansion) {
        return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl }) ? 'valid' : 'invalid';
      }
    }

    // For required bindings, a non-empty local expansion is authoritative.
    // Do not let terminology-server fail-open behavior turn a known invalid
    // primitive/status code back into a valid result.
    const filteredIncludes = await this.packageLoader.getIncludeConceptFilters(valueSetUrl, fhirVersion);
    const hasServerEvaluatedFilters = filteredIncludes.length > 0;
    const override = this.resolveServerForSystem(system);
    const shouldDelegateToServer =
      expandedCodes.size === 0 ||
      hasServerEvaluatedFilters ||
      (bindingStrength !== 'required' && this.resolutionConfig.serverDelegation?.validateCodes);

    if (this.hasTerminologyServer(override) && shouldDelegateToServer) {
      logger.debug(`[ValueSetValidator] Code not found in local expansion for ${valueSetUrl}. Attempting server $validate-code...`);
      recordTerminologyDelegation(this.terminologyDiagnostics.delegatedBindings, 'server-validate-code');
      const isValidOnServer = await this.validateCodeViaTerminologyServer(
        code,
        system,
        valueSetUrl,
        bindingStrength,
        override,
        fhirVersion,
      );
      if (isValidOnServer) {
        return this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl }) ? 'valid' : 'invalid';
      }
    }

    // Some IG ValueSets include terminology-server-only filters such as
    // LOINC CLASSTYPE. Without the CodeSystem's filter metadata, a local
    // package expansion is necessarily incomplete. If the remote server also
    // cannot confirm a non-required binding, report "not verified" rather
    // than a false-positive binding warning.
    const unverifiableReason = classifyUnverifiableFilterReason(system, code, filteredIncludes);
    if (bindingStrength !== 'required' && unverifiableReason) {
      logger.debug(
        `[ValueSetValidator] Unverifiable include filter (${unverifiableReason}) in ${valueSetUrl} ` +
        `for '${system ? `${system}|` : ''}${code}' – skipping non-required binding check`,
      );
      this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl });
      recordTerminologyReason(this.terminologyDiagnostics.unverifiedBindings, unverifiableReason);
      return 'unverified';
    }

    // ValueSet could not be expanded (e.g., German content not available on public servers).
    // Treat as "cannot verify" rather than "definitely invalid" – avoids false positives
    // when terminology servers simply don't carry the relevant content.
    if (expandedCodes.size === 0) {
      logger.debug(`[ValueSetValidator] Empty expansion for ${valueSetUrl} – skipping binding check for '${code}'`);
      this.twoPhaseShadow.finish(twoPhaseLookup, true, { code, system, valueSetUrl });
      recordTerminologyReason(this.terminologyDiagnostics.unverifiedBindings, 'empty-expansion');
      return 'unverified';
    }

    return this.twoPhaseShadow.finish(twoPhaseLookup, false, { code, system, valueSetUrl }) ? 'valid' : 'invalid';
  }

  private async isCodeInValueSetStrict(
    code: string,
    system: string | undefined,
    valueSetUrl: string,
    bindingStrength: BindingStrength,
    fhirVersion?: FhirVersion,
  ): Promise<boolean> {
    // Fail open on `unverified` to preserve the established precision contract.
    return (await this.resolveCodeBinding(code, system, valueSetUrl, bindingStrength, fhirVersion)) !== 'invalid';
  }

  private getExpandedValueSet(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<Set<string>> {
    return expandValueSet(
      {
        cache: this.cache,
        apiClient: this.apiClient,
        packageLoader: this.packageLoader,
        resolutionConfig: this.resolutionConfig,
      },
      valueSetUrl,
      fhirVersion,
    );
  }

}
