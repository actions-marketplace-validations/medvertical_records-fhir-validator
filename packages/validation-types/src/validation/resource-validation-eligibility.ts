export type ResourceValidationOperation = 'browse' | 'bulk' | 'manual';

export type ResourceValidationEligibilityReason =
  | 'browse-resource'
  | 'manual-resource'
  | 'excluded'
  | 'filter-disabled'
  | 'included'
  | 'not-included';

export interface ResourceTypeValidationPolicy {
  enabled: boolean;
  includedTypes: readonly string[];
  excludedTypes: readonly string[];
}

export interface ResourceValidationEligibilityDecision {
  shouldValidate: boolean;
  reason: ResourceValidationEligibilityReason;
}

/**
 * Read-only policy evidence attached to resources returned by Browse APIs.
 * It lets clients distinguish a resource that has not been processed yet from
 * one that was intentionally skipped by the active server policy.
 */
export interface ResourceValidationPolicyAnnotation extends ResourceValidationEligibilityDecision {
  operation: ResourceValidationOperation;
}

export interface PlannedResourceValidationSkip<TResource> {
  resource: TResource;
  decision: ResourceValidationEligibilityDecision;
}

export interface PlannedResourceValidation<TResource> {
  eligible: TResource[];
  skipped: Array<PlannedResourceValidationSkip<TResource>>;
}

/**
 * Authoritative resource-type eligibility policy shared by Browse and
 * server-side validation entry points.
 *
 * Browse and explicit/manual validation validate the requested FHIR resources
 * unless an active filter explicitly excludes their type. The include list is
 * the cohort selector for scheduled/bulk validation only.
 */
export function decideResourceValidationEligibility({
  operation,
  resourceType,
  resourceTypes,
}: {
  operation: ResourceValidationOperation;
  resourceType: string;
  resourceTypes: ResourceTypeValidationPolicy | null | undefined;
}): ResourceValidationEligibilityDecision {
  if (!resourceTypes?.enabled) {
    return { shouldValidate: true, reason: 'filter-disabled' };
  }

  // Settings persisted by older releases can contain a partial resourceTypes
  // object even though the current TypeScript contract requires both arrays.
  // Treat missing or malformed lists as empty instead of making read paths fail.
  const excludedTypes = Array.isArray(resourceTypes.excludedTypes)
    ? resourceTypes.excludedTypes
    : [];
  const includedTypes = Array.isArray(resourceTypes.includedTypes)
    ? resourceTypes.includedTypes
    : [];

  if (excludedTypes.includes(resourceType)) {
    return { shouldValidate: false, reason: 'excluded' };
  }

  if (operation === 'browse') {
    return { shouldValidate: true, reason: 'browse-resource' };
  }

  if (operation === 'manual') {
    return { shouldValidate: true, reason: 'manual-resource' };
  }

  if (
    includedTypes.length === 0
    || includedTypes.includes(resourceType)
  ) {
    return { shouldValidate: true, reason: 'included' };
  }

  return { shouldValidate: false, reason: 'not-included' };
}

/**
 * Plans a complete validation selection once, preserving skipped resources and
 * their reasons for transports and UI outcome accounting.
 */
export function planResourceValidation<TResource extends { resourceType: string }>({
  operation,
  resources,
  resourceTypes,
}: {
  operation: ResourceValidationOperation;
  resources: readonly TResource[];
  resourceTypes: ResourceTypeValidationPolicy | null | undefined;
}): PlannedResourceValidation<TResource> {
  const eligible: TResource[] = [];
  const skipped: Array<PlannedResourceValidationSkip<TResource>> = [];

  for (const resource of resources) {
    const decision = decideResourceValidationEligibility({
      operation,
      resourceType: resource.resourceType,
      resourceTypes,
    });
    if (decision.shouldValidate) eligible.push(resource);
    else skipped.push({ resource, decision });
  }

  return { eligible, skipped };
}
