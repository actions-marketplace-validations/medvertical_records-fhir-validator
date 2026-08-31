const FHIRPATH_SYSTEM_TYPE_REGEX = /^http:\/\/hl7\.org\/fhirpath\/System\.[A-Z][A-Za-z]+$/;

export function evaluateSpecialisedRootConstraint(
  key: string | undefined,
  resource: unknown,
): boolean | null {
  if (key === 'csd-1') {
    return evaluateCodeSystemCodeUniqueness(resource);
  }
  if (key === 'sdf-19') {
    return evaluateSdf19(resource);
  }
  return null;
}

/**
 * Linear equivalent of the R4 csd-1 FHIRPath expression:
 * `concept.code.combine($this.descendants().concept.code).isDistinct()`.
 *
 * Running that generic expression against large terminology resources creates
 * large intermediate descendant collections. A single 46k-concept CodeSystem
 * can otherwise occupy the application event loop for minutes.
 */
function evaluateCodeSystemCodeUniqueness(resource: unknown): boolean {
  if (!isObjectRecord(resource) || !Array.isArray(resource.concept)) return true;

  const pending: unknown[] = [...resource.concept];
  const seenConcepts = new WeakSet<object>();
  const seenCodes = new Set<string>();
  while (pending.length > 0) {
    const concept = pending.pop();
    if (!isObjectRecord(concept) || seenConcepts.has(concept)) continue;
    seenConcepts.add(concept);

    if (typeof concept.code === 'string') {
      if (seenCodes.has(concept.code)) return false;
      seenCodes.add(concept.code);
    }
    if (Array.isArray(concept.concept)) pending.push(...concept.concept);
  }
  return true;
}

function evaluateSdf19(resource: unknown): boolean {
  if (!isObjectRecord(resource) ||
      typeof resource.url !== 'string' ||
      !resource.url.startsWith('http://hl7.org/fhir/StructureDefinition')) {
    return true;
  }

  const differentialCodes = collectElementTypeCodes(getNestedElements(resource.differential));
  const snapshotCodes = collectElementTypeCodes(getNestedElements(resource.snapshot));

  return (
    differentialCodes.every(isFhirSpecificationDifferentialTypeCode) &&
    snapshotCodes.every(isFhirSpecificationSnapshotTypeCode)
  );
}

function collectElementTypeCodes(elements: unknown): string[] {
  if (!Array.isArray(elements)) return [];
  const codes: string[] = [];

  for (const element of elements) {
    if (!isObjectRecord(element) || !Array.isArray(element.type)) continue;
    for (const type of element.type) {
      if (isObjectRecord(type) && typeof type.code === 'string') {
        codes.push(type.code);
      }
    }
  }

  return codes;
}

function isFhirSpecificationDifferentialTypeCode(code: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(code) || FHIRPATH_SYSTEM_TYPE_REGEX.test(code);
}

function isFhirSpecificationSnapshotTypeCode(code: string): boolean {
  return /^[a-zA-Z0-9.]+$/.test(code) || FHIRPATH_SYSTEM_TYPE_REGEX.test(code);
}

function getNestedElements(value: unknown): unknown {
  return isObjectRecord(value) ? value.element : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
