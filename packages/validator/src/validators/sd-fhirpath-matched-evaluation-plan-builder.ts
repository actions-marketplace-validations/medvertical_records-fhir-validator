import type { Constraint } from '../core/structure-definition-types';
import { expressionStartsAtResourceRoot } from './constraint-choice-context';
import { preprocessTypeLiterals, resolveElementType } from './fhirpath-type-preprocessor';
import { InvariantRegistry } from './invariant-registry';
import type { MatchedElement } from './sd-element-matcher';
import {
  deriveChoiceTypeFromConcretePath,
  resolveChoiceTypeCast,
} from './sd-fhirpath-choice-utils';
import type { SDFHIRPathEvaluationPlan } from './sd-fhirpath-evaluation-plan';
import type { SDFHIRPathEvaluationScope } from './sd-fhirpath-evaluation-scope';

const EMPTY_PLAN: SDFHIRPathEvaluationPlan = {
  immediateIssues: [],
  resolveTargets: () => [],
};

export class SDFHIRPathMatchedEvaluationPlanBuilder {
  build(
    matched: MatchedElement,
    constraint: Constraint,
    scope: SDFHIRPathEvaluationScope,
  ): SDFHIRPathEvaluationPlan {
    if (!constraint.expression || InvariantRegistry.isSpecialised(constraint.key)) {
      return EMPTY_PLAN;
    }

    const elementType = resolveElementType(matched.element)
      ?? deriveChoiceTypeFromConcretePath(matched);
    const effectiveExpression = preprocessTypeLiterals(constraint.expression, {
      elementType,
      resourceType: scope.resourceType,
      rootResourceType: scope.resourceType,
    });
    const choiceCast = resolveChoiceTypeCast(effectiveExpression, matched);
    if (choiceCast.skip) return EMPTY_PLAN;

    const evaluationContext = expressionStartsAtResourceRoot(
      choiceCast.expression,
      scope.resourceType,
    ) ? scope.resource : matched.data;

    return {
      resolveTargets: () => [{
        constraint,
        expression: choiceCast.expression,
        context: evaluationContext,
        rootResource: scope.rootResource,
        resolveRootResource: scope.resource,
        path: matched.resourcePath,
        resourceType: scope.resourceType,
        userInvocationTable: scope.userInvocationTable,
        profileUrl: scope.profileUrl,
        fhirVersion: scope.fhirVersion,
        bundle: scope.bundle,
        terminologyResolver: scope.terminologyResolver,
      }],
    };
  }
}
