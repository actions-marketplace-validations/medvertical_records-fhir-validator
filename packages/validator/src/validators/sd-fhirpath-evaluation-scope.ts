import type { FHIRPathTerminologyResolver } from './fhirpath-async-terminology';
import type { FHIRPathBundleInput } from './fhirpath-functions';

export interface SDFHIRPathEvaluationScope {
  bundle?: FHIRPathBundleInput;
  fhirVersion: 'R4' | 'R5' | 'R6';
  profileUrl?: string;
  resource: unknown;
  resourceType: string;
  rootResource: unknown;
  terminologyResolver?: FHIRPathTerminologyResolver;
  userInvocationTable: unknown;
}
