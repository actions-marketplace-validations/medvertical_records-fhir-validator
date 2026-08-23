import { logger } from '../logger';
import type { TerminologyApiClient } from './terminology-api-client';
import { TerminologyOperationCache } from './terminology-operation-cache';
import { ValueSetCache } from './valueset-cache';
import {
  clearValueSetValidatorCaches,
  getValueSetValidatorCacheStats,
} from './valueset-cache-operations';
import type { ValueSetCodeSystemOperations } from './valueset-code-system-operations';
import { registerExternalTerminologyResourceInCache } from './valueset-external-resource-registration';
import type { FhirVersion } from './valueset-expansion-cache-key';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import { ValueSetRuntimeState } from './valueset-runtime-state';
import type { TwoPhaseShadowEvaluator } from './valueset-two-phase-shadow';
import {
  type TerminologyDiagnostics,
  type TerminologyResolutionConfig,
} from './valueset-types';
import { createValueSetValidatorComponents } from './valueset-validator-components';

/** Owns the mutable terminology state and its coordinated invalidation rules. */
export class ValueSetValidatorRuntime {
  private readonly state = new ValueSetRuntimeState();

  readonly cache: ValueSetCache;
  readonly operationCache: TerminologyOperationCache;
  readonly apiClient: TerminologyApiClient;
  readonly packageLoader: ValueSetPackageLoader;
  readonly twoPhaseShadow: TwoPhaseShadowEvaluator;
  readonly codeSystems: ValueSetCodeSystemOperations;

  constructor(
    cache: ValueSetCache = new ValueSetCache(),
    operationCache: TerminologyOperationCache = new TerminologyOperationCache(),
  ) {
    this.cache = cache;
    this.operationCache = operationCache;
    const components = createValueSetValidatorComponents(
      cache,
      operationCache,
      () => this.state.resolutionConfig,
    );
    this.apiClient = components.apiClient;
    this.packageLoader = components.packageLoader;
    this.twoPhaseShadow = components.twoPhaseShadow;
    this.codeSystems = components.codeSystems;
  }

  get resolutionConfig(): TerminologyResolutionConfig {
    return this.state.resolutionConfig;
  }

  get terminologyDiagnostics(): TerminologyDiagnostics {
    return this.state.terminologyDiagnostics;
  }

  get bindingResolutions(): ValueSetRuntimeState['bindingResolutions'] {
    return this.state.bindingResolutions;
  }

  setResolutionConfig(config: Partial<TerminologyResolutionConfig>): void {
    const resolutionConfig = this.state.updateResolutionConfig(config);
    this.apiClient.setConfig(resolutionConfig);
    this.twoPhaseShadow.setConfig(resolutionConfig.twoPhaseExpansion);
    this.state.advanceBindingResolutionEpoch();
    const twoPhase = resolutionConfig.twoPhaseExpansion?.enabled
      ? resolutionConfig.twoPhaseExpansion.mode
      : 'off';
    logger.info(
      `[ValueSetValidator] Resolution config updated: strategy=${resolutionConfig.strategy}, twoPhase=${twoPhase}`,
    );
  }

  getResolutionConfig(): TerminologyResolutionConfig {
    return this.state.getResolutionConfigSnapshot();
  }

  registerExternalTerminologyResource(
    resource: unknown,
    fhirVersion: FhirVersion,
  ): boolean {
    return registerExternalTerminologyResourceInCache(
      this.cache,
      resource,
      fhirVersion,
      () => {
        this.packageLoader.clearLookupState();
        this.state.advanceBindingResolutionEpoch();
      },
    );
  }

  clearCache(): void {
    clearValueSetValidatorCaches(this.cacheOperationDeps());
    this.state.resetTerminologyDiagnostics();
    logger.debug('[ValueSetValidator] Cache cleared');
  }

  getCacheStats() {
    return getValueSetValidatorCacheStats(this.cacheOperationDeps());
  }

  private cacheOperationDeps() {
    return {
      bindingResolutions: this.bindingResolutions,
      cache: this.cache,
      operationCache: this.operationCache,
      packageLoader: this.packageLoader,
      terminologyDiagnostics: this.state.terminologyDiagnostics,
      twoPhaseShadow: this.twoPhaseShadow,
    };
  }
}
