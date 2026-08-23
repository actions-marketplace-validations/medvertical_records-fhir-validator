export const MAX_FHIR_OBJECT_NODES = 20_000;

export type FhirObjectTraversalScope = 'reference' | 'contained-resource';

/** Prevent bounded object walks from silently returning partial evidence. */
export function assertFhirObjectTraversalCapacity(
  processedNodes: number,
  scope: FhirObjectTraversalScope,
): void {
  if (processedNodes < MAX_FHIR_OBJECT_NODES) return;
  throw Object.assign(
    new Error(`FHIR ${scope} traversal exceeded the supported object limit`),
    { code: 'FHIR_TRAVERSAL_LIMIT' },
  );
}
