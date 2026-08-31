const RESOURCE_URL_RE =
  /^https?:\/\/[^\s]+\/([A-Z][A-Za-z]+)\/[A-Za-z0-9\-.]+(?:\/_history\/[A-Za-z0-9\-.]+)?$/;
const RELATIVE_RE =
  /^([A-Z][A-Za-z]+)\/[A-Za-z0-9\-.]+(?:\/_history\/[A-Za-z0-9\-.]+)?$/;

const UNRESTRICTED_TARGET_CANONICALS = new Set([
  'http://hl7.org/fhir/StructureDefinition/Resource',
  'http://hl7.org/fhir/StructureDefinition/DomainResource',
]);

const KNOWN_RESOURCE_TYPES = new Set([
  'Account', 'ActivityDefinition', 'AdverseEvent', 'AllergyIntolerance', 'Appointment',
  'AppointmentResponse', 'AuditEvent', 'Basic', 'Binary', 'BiologicallyDerivedProduct',
  'BodyStructure', 'Bundle', 'CapabilityStatement', 'CarePlan', 'CareTeam', 'CatalogEntry',
  'ChargeItem', 'ChargeItemDefinition', 'Claim', 'ClaimResponse', 'ClinicalImpression',
  'CodeSystem', 'Communication', 'CommunicationRequest', 'CompartmentDefinition',
  'Composition', 'ConceptMap', 'Condition', 'Consent', 'Contract', 'Coverage',
  'CoverageEligibilityRequest', 'CoverageEligibilityResponse', 'DetectedIssue', 'Device',
  'DeviceDefinition', 'DeviceMetric', 'DeviceRequest', 'DeviceUseStatement',
  'DiagnosticReport', 'DocumentManifest', 'DocumentReference', 'EffectEvidenceSynthesis',
  'Encounter', 'Endpoint', 'EnrollmentRequest', 'EnrollmentResponse', 'EpisodeOfCare',
  'EventDefinition', 'Evidence', 'EvidenceVariable', 'ExampleScenario',
  'ExplanationOfBenefit', 'FamilyMemberHistory', 'Flag', 'Goal', 'GraphDefinition',
  'Group', 'GuidanceResponse', 'HealthcareService', 'ImagingStudy', 'Immunization',
  'ImmunizationEvaluation', 'ImmunizationRecommendation', 'ImplementationGuide',
  'InsurancePlan', 'Invoice', 'Library', 'Linkage', 'List', 'Location', 'Measure',
  'MeasureReport', 'Media', 'Medication', 'MedicationAdministration',
  'MedicationDispense', 'MedicationKnowledge', 'MedicationRequest',
  'MedicationStatement', 'MedicinalProduct', 'MedicinalProductAuthorization',
  'MedicinalProductContraindication', 'MedicinalProductIndication',
  'MedicinalProductIngredient', 'MedicinalProductInteraction',
  'MedicinalProductManufactured', 'MedicinalProductPackaged',
  'MedicinalProductPharmaceutical', 'MedicinalProductUndesirableEffect',
  'MessageDefinition', 'MessageHeader', 'MolecularSequence', 'NamingSystem',
  'NutritionOrder', 'Observation', 'ObservationDefinition', 'OperationDefinition',
  'OperationOutcome', 'Organization', 'OrganizationAffiliation', 'Parameters',
  'Patient', 'PaymentNotice', 'PaymentReconciliation', 'Person', 'PlanDefinition',
  'Practitioner', 'PractitionerRole', 'Procedure', 'Provenance', 'Questionnaire',
  'QuestionnaireResponse', 'RelatedPerson', 'RequestGroup', 'ResearchDefinition',
  'ResearchElementDefinition', 'ResearchStudy', 'ResearchSubject', 'RiskAssessment',
  'RiskEvidenceSynthesis', 'Schedule', 'SearchParameter', 'ServiceRequest', 'Slot',
  'Specimen', 'SpecimenDefinition', 'StructureDefinition', 'StructureMap',
  'Subscription', 'Substance', 'SubstanceNucleicAcid', 'SubstancePolymer',
  'SubstanceProtein', 'SubstanceReferenceInformation', 'SubstanceSourceMaterial',
  'SubstanceSpecification', 'SupplyDelivery', 'SupplyRequest', 'Task',
  'TerminologyCapabilities', 'TestReport', 'TestScript', 'ValueSet',
  'VerificationResult', 'VisionPrescription',
]);

export type ProfileTypeResolver = (canonicalUrl: string) => string | null;
export type ReferenceResolver = (reference: string) => unknown;

export function extractResourceTypeFromCanonical(
  canonical: string,
  profileTypeResolver?: ProfileTypeResolver,
): string | null {
  const base = canonicalBase(canonical);
  const profileId = base.split('/').pop();
  if (!profileId) return null;
  if (KNOWN_RESOURCE_TYPES.has(profileId)) return profileId;

  const resolved = profileTypeResolver?.(base);
  if (resolved && KNOWN_RESOURCE_TYPES.has(resolved)) return resolved;

  // IG profile ids commonly qualify a resource type at an id boundary (for
  // example `patient-eu-eps` or `us-core-patient`). Do not infer from an
  // interior token: `mii-pr-patho-problem-list-item` is a Condition profile,
  // not a List profile. Resolved StructureDefinition metadata remains the
  // authoritative source above.
  const profileTokens = profileId.toLowerCase().split(/[-_.]/);
  const boundaryTokens = new Set([
    profileTokens[0],
    profileTokens[profileTokens.length - 1],
  ]);
  const tokenType = [...KNOWN_RESOURCE_TYPES]
    .sort((left, right) => right.length - left.length)
    .find(resourceType => boundaryTokens.has(resourceType.toLowerCase()));
  return tokenType ?? null;
}

export function extractTargetTypeFromReference(reference: string): string | null {
  const relativeType = reference.match(RELATIVE_RE)?.[1];
  if (relativeType) return relativeType;

  // An absolute URL is only a typed RESTful reference when its tail segment
  // is a real resource type name; anything else (e.g. "EndPoint/1") is an
  // opaque identity URL whose target type cannot be inferred.
  const absoluteType = reference.match(RESOURCE_URL_RE)?.[1];
  return absoluteType && KNOWN_RESOURCE_TYPES.has(absoluteType) ? absoluteType : null;
}

export function resolveTargetTypeViaResolver(
  reference: string,
  resolveReference?: ReferenceResolver,
): string | null {
  if (!resolveReference) return null;
  const target = resolveReference(reference);
  return isRecord(target) && typeof target.resourceType === 'string'
    ? target.resourceType
    : null;
}

export function resolveContainedTargetType(
  reference: string,
  rootResource: Record<string, unknown>,
): string | null {
  if (!reference.startsWith('#')) return null;
  const id = reference.slice(1);
  if (id === '') return null;

  const contained = Array.isArray(rootResource.contained)
    ? rootResource.contained
    : [];
  const match = contained.find(candidate => isRecord(candidate) && candidate.id === id);
  return isRecord(match) && typeof match.resourceType === 'string'
    ? match.resourceType
    : null;
}

export function isProfiledCanonical(canonical: string): boolean {
  const base = canonicalBase(canonical);
  if (UNRESTRICTED_TARGET_CANONICALS.has(base)) return false;
  const last = base.match(/\/([A-Za-z][A-Za-z0-9-]*)$/)?.[1];
  return last !== undefined && !KNOWN_RESOURCE_TYPES.has(last);
}

export function isUnrestrictedCanonical(canonical: string): boolean {
  return UNRESTRICTED_TARGET_CANONICALS.has(canonicalBase(canonical));
}

export function canonicalBase(canonical: string): string {
  return canonical.split('|')[0];
}

export function isAbsoluteUri(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
