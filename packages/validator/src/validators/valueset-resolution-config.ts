import type { TerminologyResolutionConfig } from './valueset-types';
import { snapshotTerminologyConfig } from './terminology-config-snapshot';

export function cloneTerminologyResolutionConfig(
  config: TerminologyResolutionConfig,
): TerminologyResolutionConfig {
  return snapshotTerminologyConfig(config);
}

export function mergeTerminologyResolutionConfig(
  current: TerminologyResolutionConfig,
  update: Partial<TerminologyResolutionConfig>,
): TerminologyResolutionConfig {
  return cloneTerminologyResolutionConfig({
    ...current,
    ...update,
    serverDelegation: update.serverDelegation === undefined
      ? current.serverDelegation
      : {
        ...current.serverDelegation,
        ...update.serverDelegation,
      },
  });
}
