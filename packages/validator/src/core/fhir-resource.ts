export interface FhirResource extends Record<string, unknown> {
  resourceType: string;
}

export function isFhirResource(value: unknown): value is FhirResource {
  return isRecord(value) &&
    typeof value.resourceType === 'string' &&
    value.resourceType.length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resourceTypeOf(value: unknown, fallback = 'Resource'): string {
  return isRecord(value) && typeof value.resourceType === 'string'
    ? value.resourceType
    : fallback;
}

export function resourceIdOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}
