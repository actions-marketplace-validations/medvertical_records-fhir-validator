import type { Constraint } from '../core/structure-definition-types';
import type { CollectedConstraint } from './sd-constraint-collector';
import type { MatchedElement } from './sd-element-matcher';
import { SDFHIRPathCollectedEvaluationPlanBuilder } from './sd-fhirpath-collected-evaluation-plan-builder';
import type { SDFHIRPathEvaluationPlan } from './sd-fhirpath-evaluation-plan';
import type { SDFHIRPathEvaluationScope } from './sd-fhirpath-evaluation-scope';
import { SDFHIRPathMatchedEvaluationPlanBuilder } from './sd-fhirpath-matched-evaluation-plan-builder';

export type { SDFHIRPathEvaluationPlan } from './sd-fhirpath-evaluation-plan';

/** Builds executable targets without owning expression execution or failure policy. */
export class SDFHIRPathEvaluationPlanFactory {
  private readonly matchedPlans = new SDFHIRPathMatchedEvaluationPlanBuilder();
  private readonly collectedPlans = new SDFHIRPathCollectedEvaluationPlanBuilder();

  createMatchedPlan(
    matched: MatchedElement,
    constraint: Constraint,
    scope: SDFHIRPathEvaluationScope,
  ): SDFHIRPathEvaluationPlan {
    return this.matchedPlans.build(matched, constraint, scope);
  }

  createCollectedPlan(
    collected: CollectedConstraint,
    scope: SDFHIRPathEvaluationScope,
  ): SDFHIRPathEvaluationPlan {
    return this.collectedPlans.build(collected, scope);
  }
}
