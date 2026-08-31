import type { ValidationIssue } from '../types';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { SDConstraintCollector } from './sd-constraint-collector';
import { SDElementMatcher } from './sd-element-matcher';
import {
    createFHIRPathContext,
    type FHIRPathBundleInput,
} from './fhirpath-functions';
import { logger } from '../logger';
import type { SDFHIRPathExpressionCache } from './sd-fhirpath-expression-cache';
import {
    createSDFHIRPathInvocationTable,
} from './sd-fhirpath-runtime';
import type { FHIRPathTerminologyResolver } from './fhirpath-async-terminology';
import { ValueSetCache } from './valueset-cache';
import { SDFHIRPathConstraintRunner } from './sd-fhirpath-constraint-runner';
import type { SDFHIRPathEvaluationScope } from './sd-fhirpath-evaluation-scope';

export { evaluateSpecialisedRootConstraint } from './sd-fhirpath-specialised-root-constraints';

export interface SDFHIRPathContext {
    resource: unknown;
    resourceType: string;
    structureDef: StructureDefinition;
    /**
     * FHIRPath `%resource` / `%rootResource` context. This differs from
     * `resource` when a non-resource datatype is validated recursively, for
     * example an Extension profile attached to Patient.gender.
     */
    rootResource?: unknown;
    bundle?: FHIRPathBundleInput;
    bundleResources?: Map<string, unknown>; // Map of fullUrl/id to resource
    fhirVersion?: 'R4' | 'R5' | 'R6';
    terminologyResolver?: FHIRPathTerminologyResolver;
}

export class SDFHIRPathExecutor {
    private readonly valueSetCache: ValueSetCache;
    private readonly constraintRunner: SDFHIRPathConstraintRunner;
    private readonly elementMatcher: SDElementMatcher;

    constructor(
        cache: ValueSetCache = new ValueSetCache(),
        expressionCache?: SDFHIRPathExpressionCache,
        constraintCollector?: SDConstraintCollector,
        elementMatcher: SDElementMatcher = new SDElementMatcher(),
    ) {
        this.valueSetCache = cache;
        this.constraintRunner = new SDFHIRPathConstraintRunner(
            cache,
            expressionCache,
            constraintCollector,
        );
        this.elementMatcher = elementMatcher;
    }

    /**
     * Execute ALL FHIRPath constraints from StructureDefinition
     */
    async execute(context: SDFHIRPathContext): Promise<ValidationIssue[]> {
        const {
            resource,
            resourceType,
            structureDef,
            bundle,
            bundleResources,
            fhirVersion = 'R4',
            terminologyResolver,
        } = context;
        if (!structureDef || !resource) return [];

        const rootResource = context.rootResource ?? resource;
        const profileUrl = structureDef.url;
        // Create FHIRPath context and build userInvocationTable once per execute() call
        const fhirPathContext = createFHIRPathContext(
            rootResource,
            bundleResources ?? bundle,
            this.valueSetCache,
        );
        const userInvocationTable = createSDFHIRPathInvocationTable(fhirPathContext);
        const evaluationScope: SDFHIRPathEvaluationScope = {
            bundle: bundleResources ?? bundle,
            fhirVersion,
            profileUrl,
            resource,
            resourceType,
            rootResource,
            terminologyResolver,
            userInvocationTable,
        };

        const matchResult = this.elementMatcher.match(resource, structureDef);

        logger.debug(`[SDFHIRPathExecutor] Matched ${matchResult.matches.length} elements, ${matchResult.constraintElements.length} with constraints`);

        const issues = await this.constraintRunner.evaluate(
            matchResult,
            structureDef,
            resource,
            resourceType,
            evaluationScope,
        );

        logger.debug(`[SDFHIRPathExecutor] Found ${issues.length} violations`);

        return issues;
    }

    getExpressionCacheStats(): ReturnType<SDFHIRPathExpressionCache['getStats']> {
        return this.constraintRunner.getExpressionCacheStats();
    }

    clearExpressionCache(): void {
        this.constraintRunner.clearExpressionCache();
    }
}
