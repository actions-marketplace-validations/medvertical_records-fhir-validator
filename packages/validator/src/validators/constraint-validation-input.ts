import type {
  Constraint,
  ElementDefinition,
} from '../core/structure-definition-types';
import type { BundleResourceInput } from './fhirpath-resolve-precheck';
import type { buildUserInvocationTable } from './fhirpath-custom-functions';
import { isRecord } from '../core/fhir-resource';
import type { FhirResource } from '../core/fhir-resource';

export { isFhirResource, isRecord } from '../core/fhir-resource';
export type { FhirResource } from '../core/fhir-resource';

export interface ConstraintValidationState {
  strictnessMode: 'standard' | 'strict';
  fhirVersion: 'R4' | 'R5' | 'R6';
  userInvocationTable: ReturnType<typeof buildUserInvocationTable>;
  bundle?: BundleResourceInput;
  rootResource?: FhirResource;
}

export interface ConstraintValidationOptions {
  strictMode?: boolean;
  fhirVersion?: 'R4' | 'R5' | 'R6';
  bundle?: BundleResourceInput;
  /**
   * FHIRPath `%resource` binding when the validated input is not the
   * containing resource — e.g. a slice value validated against its type
   * profile, where constraints like `%resource.where(gender='other')`
   * must see the resource that holds the sliced element.
   */
  rootResource?: FhirResource;
}

export function isElementWithConstraints(
  value: unknown,
): value is ElementDefinition & { constraint: unknown[] } {
  return isRecord(value) &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    Array.isArray(value.constraint) &&
    value.constraint.length > 0;
}

export function isConstraint(value: unknown): value is Constraint {
  return isRecord(value) &&
    typeof value.key === 'string' &&
    value.key.length > 0 &&
    (value.severity === 'error' || value.severity === 'warning') &&
    typeof value.human === 'string' &&
    (value.expression === undefined || typeof value.expression === 'string');
}
