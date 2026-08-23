const CANONICAL_SYSTEM_SUGGESTIONS: Record<string, string> = {
  'http://terminology.hl7.org/CodeSystem/condition-verstatus':
    'http://terminology.hl7.org/CodeSystem/condition-ver-status',
};

const VALUE_SET_SYSTEM_SUGGESTIONS: Record<string, Record<string, string>> = {
  'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical': {
    'http://terminology.hl7.org/CodeSystem/condition-clinical':
      'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  },
  'http://hl7.org/fhir/ValueSet/allergyintolerance-verification': {
    'http://terminology.hl7.org/CodeSystem/condition-ver-status':
      'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
    'http://terminology.hl7.org/CodeSystem/condition-verstatus':
      'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  },
};

export function buildBindingViolationDetails(
  system?: string,
  valueSet?: string,
): Record<string, unknown> | undefined {
  if (!system) return undefined;
  const valueSetBase = valueSet?.split('|')[0];
  const suggestedSystem = (valueSetBase
    ? VALUE_SET_SYSTEM_SUGGESTIONS[valueSetBase]?.[system]
    : undefined)
    ?? CANONICAL_SYSTEM_SUGGESTIONS[system];
  return suggestedSystem ? {
    suggestedSystem,
    fixHint: `Replace Coding.system '${system}' with '${suggestedSystem}'.`,
  } : undefined;
}
