import { TerminologyApiClient } from './terminology-api-client';
import type { TerminologyOperationCache } from './terminology-operation-cache';
import type { ValueSetCache } from './valueset-cache';
import { ValueSetCodeSystemOperations } from './valueset-code-system-operations';
import { ValueSetPackageLoader } from './valueset-package-loader';
import { TwoPhaseShadowEvaluator } from './valueset-two-phase-shadow';
import type { TerminologyResolutionConfig } from './valueset-types';

export interface ValueSetValidatorComponents {
  apiClient: TerminologyApiClient;
  packageLoader: ValueSetPackageLoader;
  twoPhaseShadow: TwoPhaseShadowEvaluator;
  codeSystems: ValueSetCodeSystemOperations;
}

export function createValueSetValidatorComponents(
  cache: ValueSetCache,
  operationCache: TerminologyOperationCache,
  getResolutionConfig: () => TerminologyResolutionConfig,
): ValueSetValidatorComponents {
  const config = getResolutionConfig();
  const apiClient = new TerminologyApiClient(config, cache, operationCache);
  const packageLoader = new ValueSetPackageLoader(cache);
  return {
    apiClient,
    packageLoader,
    twoPhaseShadow: new TwoPhaseShadowEvaluator(packageLoader, config.twoPhaseExpansion),
    codeSystems: new ValueSetCodeSystemOperations({
      apiClient,
      cache,
      getResolutionConfig,
      packageLoader,
    }),
  };
}
