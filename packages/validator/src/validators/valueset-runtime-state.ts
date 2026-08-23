import { EpochSingleflight } from './epoch-singleflight';
import { createEmptyTerminologyDiagnostics } from './valueset-diagnostics';
import {
  cloneTerminologyResolutionConfig,
  mergeTerminologyResolutionConfig,
} from './valueset-resolution-config';
import {
  DEFAULT_RESOLUTION_CONFIG,
  type CodeBindingOutcome,
  type TerminologyDiagnostics,
  type TerminologyResolutionConfig,
} from './valueset-types';

/** Owns mutable ValueSet resolution state independently from runtime components. */
export class ValueSetRuntimeState {
  private currentResolutionConfig = cloneTerminologyResolutionConfig(
    DEFAULT_RESOLUTION_CONFIG,
  );
  private currentTerminologyDiagnostics = createEmptyTerminologyDiagnostics();

  readonly bindingResolutions = new EpochSingleflight<CodeBindingOutcome>();

  get resolutionConfig(): TerminologyResolutionConfig {
    return this.currentResolutionConfig;
  }

  get terminologyDiagnostics(): TerminologyDiagnostics {
    return this.currentTerminologyDiagnostics;
  }

  updateResolutionConfig(
    config: Partial<TerminologyResolutionConfig>,
  ): TerminologyResolutionConfig {
    this.currentResolutionConfig = mergeTerminologyResolutionConfig(
      this.currentResolutionConfig,
      config,
    );
    return this.currentResolutionConfig;
  }

  getResolutionConfigSnapshot(): TerminologyResolutionConfig {
    return cloneTerminologyResolutionConfig(this.currentResolutionConfig);
  }

  advanceBindingResolutionEpoch(): void {
    this.bindingResolutions.advanceEpoch();
  }

  resetTerminologyDiagnostics(): void {
    this.currentTerminologyDiagnostics = createEmptyTerminologyDiagnostics();
  }
}
