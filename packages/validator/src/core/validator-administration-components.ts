import { ValidatorDirectAspectValidation } from './validator-direct-aspect-validation';
import { ValidatorProfileAdministration } from './validator-profile-administration';
import { ValidatorTerminologyAdministration } from './validator-terminology-administration';
import type { ValidatorCoreComponents } from './validator-core-components';
import type { ValidatorExecutionComponents } from './validator-execution-components';

export interface ValidatorAdministrationComponents {
  profileAdministration: ValidatorProfileAdministration;
  directAspectValidation: ValidatorDirectAspectValidation;
  terminologyAdministration: ValidatorTerminologyAdministration;
}

export function createValidatorAdministrationComponents(
  core: ValidatorCoreComponents,
  execution: ValidatorExecutionComponents,
): ValidatorAdministrationComponents {
  return {
    profileAdministration: new ValidatorProfileAdministration(
      core.sdLoader,
      core.profileCache,
      core.snapshotGenerator,
    ),
    directAspectValidation: new ValidatorDirectAspectValidation(
      execution.metadataExecutor,
      execution.referenceExecutor,
    ),
    terminologyAdministration: new ValidatorTerminologyAdministration(
      execution.structuralExecutor,
      execution.terminologyExecutor,
      core.valuesetValidator,
    ),
  };
}
