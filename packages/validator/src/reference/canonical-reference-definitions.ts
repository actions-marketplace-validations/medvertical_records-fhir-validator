export type CanonicalResourceType =
  | 'StructureDefinition'
  | 'ValueSet'
  | 'CodeSystem'
  | 'ConceptMap'
  | 'SearchParameter'
  | 'CapabilityStatement'
  | 'OperationDefinition'
  | 'NamingSystem'
  | 'ImplementationGuide'
  | 'Questionnaire'
  | 'PlanDefinition'
  | 'Measure'
  | 'Library'
  | 'ActivityDefinition'
  | 'ChargeItemDefinition'
  | 'EventDefinition'
  | 'MessageDefinition'
  | 'CompartmentDefinition'
  | 'GraphDefinition'
  | 'ExampleScenario'
  | 'ObservationDefinition'
  | 'SpecimenDefinition'
  | 'StructureMap'
  | 'TerminologyCapabilities'
  | 'TestPlan';

export const CANONICAL_RESOURCE_TYPES = new Set<CanonicalResourceType>([
  'StructureDefinition',
  'ValueSet',
  'CodeSystem',
  'ConceptMap',
  'SearchParameter',
  'CapabilityStatement',
  'OperationDefinition',
  'NamingSystem',
  'ImplementationGuide',
  'Questionnaire',
  'PlanDefinition',
  'Measure',
  'Library',
  'ActivityDefinition',
  'ChargeItemDefinition',
  'EventDefinition',
  'MessageDefinition',
  'CompartmentDefinition',
  'GraphDefinition',
  'ExampleScenario',
  'ObservationDefinition',
  'SpecimenDefinition',
  'StructureMap',
  'TerminologyCapabilities',
  'TestPlan',
]);

export function isCanonicalResourceType(
  value: string,
): value is CanonicalResourceType {
  return CANONICAL_RESOURCE_TYPES.has(value as CanonicalResourceType);
}

export const CANONICAL_URL_PATTERN = /^https?:\/\/.+/;
export const CANONICAL_URN_PATTERN = /^urn:[a-z0-9][a-z0-9-]{0,31}:.+/i;

export const CANONICAL_FIELDS = [
  'url',
  'profile',
  'targetProfile',
  'system',
  'valueSet',
  'instantiatesCanonical',
  'instantiatesUri',
  'derivedFrom',
  'basedOn',
  'partOf',
];

export const COMMON_CANONICAL_BASE_URLS: Record<string, string> = {
  'hl7.org': 'http://hl7.org/fhir',
  'fhir.org': 'http://fhir.org',
  'nictiz.nl': 'http://nictiz.nl/fhir',
  'simplifier.net': 'http://simplifier.net',
  'medizininformatik-initiative.de': 'https://www.medizininformatik-initiative.de/fhir',
  'gematik.de': 'https://gematik.de/fhir',
  'kbv.de': 'https://fhir.kbv.de',
};
