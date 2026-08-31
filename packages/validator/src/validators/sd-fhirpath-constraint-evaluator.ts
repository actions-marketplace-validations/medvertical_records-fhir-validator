import type { Constraint } from '../core/structure-definition-types';
import type { ValidationIssue } from '../types';
import type { CollectedConstraint } from './sd-constraint-collector';
import type { MatchedElement } from './sd-element-matcher';
import { handleSDFHIRPathEvaluationFailure } from './sd-fhirpath-evaluation-failure';
import {
  SDFHIRPathEvaluationPlanFactory,
  type SDFHIRPathEvaluationPlan,
} from './sd-fhirpath-evaluation-plans';
import type { SDFHIRPathEvaluationScope } from './sd-fhirpath-evaluation-scope';
import { SDFHIRPathExpressionCache } from './sd-fhirpath-expression-cache';
import { SDFHIRPathExpressionRuntime } from './sd-fhirpath-expression-runtime';
import type { ValueSetCache } from './valueset-cache';

export type { SDFHIRPathEvaluationScope } from './sd-fhirpath-evaluation-scope';

export class SDFHIRPathConstraintEvaluator {
  private readonly evaluationPlans = new SDFHIRPathEvaluationPlanFactory();
  private readonly expressionRuntime: SDFHIRPathExpressionRuntime;

  constructor(
    valueSetCache: ValueSetCache,
    expressionCache: SDFHIRPathExpressionCache = new SDFHIRPathExpressionCache(),
  ) {
    this.expressionRuntime = new SDFHIRPathExpressionRuntime(valueSetCache, expressionCache);
  }

  async evaluateMatchedConstraint(
    matched: MatchedElement,
    constraint: Constraint,
    scope: SDFHIRPathEvaluationScope,
  ): Promise<ValidationIssue[]> {
    const plan = this.evaluationPlans.createMatchedPlan(matched, constraint, scope);
    if (plan.immediateIssues) return plan.immediateIssues;

    try {
      return await this.evaluatePlan(plan);
    } catch (error: unknown) {
      return handleSDFHIRPathEvaluationFailure({
        constraint,
        error,
        path: matched.resourcePath,
        phase: 'matched',
        profileUrl: scope.profileUrl,
        resourceType: scope.resourceType,
      });
    }
  }

  async evaluateCollectedConstraint(
    collected: CollectedConstraint,
    scope: SDFHIRPathEvaluationScope,
  ): Promise<ValidationIssue[]> {
    const plan = this.evaluationPlans.createCollectedPlan(collected, scope);
    if (plan.immediateIssues) return plan.immediateIssues;

    try {
      return await this.evaluatePlan(plan);
    } catch (error: unknown) {
      return handleSDFHIRPathEvaluationFailure({
        constraint: collected.constraint,
        error,
        path: collected.elementPath,
        phase: 'collected',
        profileUrl: scope.profileUrl,
        resourceType: scope.resourceType,
      });
    }
  }

  private async evaluatePlan(plan: SDFHIRPathEvaluationPlan): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    for (const target of plan.resolveTargets()) {
      issues.push(...await this.expressionRuntime.evaluateTarget(target));
    }
    return issues;
  }
}
