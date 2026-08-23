import { logger } from '../logger';
import type { FhirVersion } from './valueset-expansion-cache-key';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { terminologyTargetMetadata } from '../utils/sensitive-logging-metadata';

interface ValueSetAvailabilityDeps {
  getExpandedValueSet: (valueSetUrl: string, fhirVersion?: FhirVersion) => Promise<Set<string>>;
  packageLoader: ValueSetPackageLoader;
}

export async function isValueSetAvailable(
  deps: ValueSetAvailabilityDeps,
  valueSetUrl: string,
  fhirVersion?: FhirVersion,
): Promise<boolean> {
  try {
    if (await deps.packageLoader.loadValueSetResource(valueSetUrl, fhirVersion)) return true;
    return (await deps.getExpandedValueSet(valueSetUrl, fhirVersion)).size > 0;
  } catch (error: unknown) {
    logger.warn('[ValueSetValidator] Could not resolve ValueSet', {
      ...terminologyTargetMetadata(valueSetUrl),
      ...validationFailureMetadata(error),
    });
    return false;
  }
}
