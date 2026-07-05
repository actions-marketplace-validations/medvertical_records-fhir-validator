/**
 * FHIR Schema Boundary
 *
 * Experimental StructureDefinition → FHIRSchema converter and validation graph.
 * This surface is for evidence, dual-path comparison, and representation
 * experiments. It is not the default runtime validation path.
 */

export {
    convertToFHIRSchema,
    mergeDifferentialWithBase,
    extractAllBindings,
    extractExtensionDefs,
    summarizeConversion,
} from './sd-to-fhir-schema';
export { compileFHIRSchemaToValidationGraph, summarizeGraph } from './validation-graph-compiler';
export { validateResourceWithGraph } from './validation-graph-executor';
export {
    FHIR_SCHEMA_RUNTIME_POLICY,
    isFhirSchemaDefaultRuntimeEnabled,
} from './runtime-policy';

export type {
    FHIRSchema,
    FHIRSchemaElement,
    FHIRSchemaSlicing,
    FHIRSchemaSlice,
    FHIRSchemaBinding,
    FHIRSchemaConstraint,
    BaseResolver,
    SDElement,
    StructureDefinition,
} from './sd-to-fhir-schema';
export type {
    ValidationGraph,
    ValidationGraphNode,
    ValidationGraphStats,
} from './validation-graph-types';
export type {
    FhirSchemaPromotionRequirement,
    FhirSchemaRuntimeMode,
    FhirSchemaRuntimePolicy,
} from './runtime-policy';
