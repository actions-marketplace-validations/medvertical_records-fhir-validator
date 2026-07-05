export type FhirSchemaRuntimeMode = 'evidence-only';

export type FhirSchemaPromotionRequirement =
  | 'java-operationoutcome-confirmation'
  | 'records-runtime-parity'
  | 'profile-scope-coverage'
  | 'no-open-dual-path-gate-failures';

export interface FhirSchemaRuntimePolicy {
  readonly mode: FhirSchemaRuntimeMode;
  readonly defaultRuntimeEnabled: boolean;
  readonly measuredLanes: readonly string[];
  readonly promotionRequires: readonly FhirSchemaPromotionRequirement[];
  readonly statement: string;
}

const MEASURED_LANES = [
  'fhir-schema-dual-path',
  'fhir-schema-reference-cli',
  'mii-reference-triangulation',
] as const;

const PROMOTION_REQUIREMENTS = [
  'java-operationoutcome-confirmation',
  'records-runtime-parity',
  'profile-scope-coverage',
  'no-open-dual-path-gate-failures',
] as const satisfies readonly FhirSchemaPromotionRequirement[];

export const FHIR_SCHEMA_RUNTIME_POLICY: FhirSchemaRuntimePolicy = Object.freeze({
  mode: 'evidence-only',
  defaultRuntimeEnabled: false,
  measuredLanes: Object.freeze(MEASURED_LANES),
  promotionRequires: Object.freeze(PROMOTION_REQUIREMENTS),
  statement:
    'FHIR Schema is an experimental intermediate representation for evidence and convergence work; the default validator runtime remains StructureDefinition-first.',
});

export function isFhirSchemaDefaultRuntimeEnabled(): boolean {
  return FHIR_SCHEMA_RUNTIME_POLICY.defaultRuntimeEnabled;
}
