const FHIRPATH_SYSTEM_TYPE_REGEX = /^http:\/\/hl7\.org\/fhirpath\/System\.[A-Z][A-Za-z]+$/;

export function evaluateSpecialisedRootConstraint(key: string | undefined, resource: any): boolean | null {
  if (key === 'sdf-19') {
    return evaluateSdf19(resource);
  }
  return null;
}

function evaluateSdf19(resource: any): boolean {
  if (!resource?.url?.startsWith('http://hl7.org/fhir/StructureDefinition')) {
    return true;
  }

  const differentialCodes = collectElementTypeCodes(resource?.differential?.element);
  const snapshotCodes = collectElementTypeCodes(resource?.snapshot?.element);

  return (
    differentialCodes.every(isFhirSpecificationDifferentialTypeCode) &&
    snapshotCodes.every(isFhirSpecificationSnapshotTypeCode)
  );
}

function collectElementTypeCodes(elements: any): string[] {
  if (!Array.isArray(elements)) return [];
  const codes: string[] = [];

  for (const element of elements) {
    if (!Array.isArray(element?.type)) continue;
    for (const type of element.type) {
      if (typeof type?.code === 'string') {
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
