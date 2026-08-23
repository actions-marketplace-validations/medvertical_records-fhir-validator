import type { Constraint } from '../core/structure-definition-types';
import type { ValidationIssue } from '../types';
import { resolveConstraintContext } from './constraint-context-resolver';
import type { ConstraintExpressionCache } from './constraint-expression-cache';
import { ConstraintMemberOfPrechecks } from './constraint-memberof-prechecks';
import type { ConstraintValidationState, FhirResource } from './constraint-validation-input';
import { constraintOutcomeIssues } from './constraint-violation-issue';
import { appendHtmlChecksConstraintIssues } from './fhirpath-html-checks';
import { evaluateResolveExistsConstraint } from './fhirpath-resolve-precheck';
import { getEvaluationContext } from './constraint-path-utils';
import type { ValueSetCache } from './valueset-cache';

export type ConstraintPrecheckResult =
  | { handled: true; issues: ValidationIssue[] }
  | { handled: false; context: unknown; expression: string };

/**
 * Runs deterministic constraint checks before the general FHIRPath engine.
 * The order is significant: each supported shape either owns the outcome or
 * supplies the resolved context and rewritten expression for fallback.
 */
export class ConstraintEvaluationPrecheckPipeline {
  private readonly memberOfPrechecks: ConstraintMemberOfPrechecks;

  constructor(
    valueSetCache: ValueSetCache,
    private readonly expressionCache: ConstraintExpressionCache,
  ) {
    this.memberOfPrechecks = new ConstraintMemberOfPrechecks(
      valueSetCache,
      expressionCache,
    );
  }

  async evaluate({
    resource,
    elementPath,
    constraint,
    profileUrl,
    expression,
    state,
    terminologyResolverConfigured,
  }: {
    resource: FhirResource;
    elementPath: string;
    constraint: Constraint;
    profileUrl: string;
    expression: string;
    state: ConstraintValidationState;
    terminologyResolverConfigured: boolean;
  }): Promise<ConstraintPrecheckResult> {
    const htmlIssues: ValidationIssue[] = [];
    if (appendHtmlChecksConstraintIssues(
      htmlIssues,
      expression,
      getEvaluationContext(resource, elementPath),
      elementPath,
      resource.resourceType,
      profileUrl,
    )) {
      return { handled: true, issues: htmlIssues };
    }

    const simpleMemberOf = await this.memberOfPrechecks.evaluateSimple(
      expression,
      resource,
      resource.resourceType,
      state.fhirVersion,
      terminologyResolverConfigured,
    );
    if (simpleMemberOf !== null) {
      return this.outcome(simpleMemberOf, resource, elementPath, constraint, profileUrl, state);
    }

    const trailingMemberOf = this.memberOfPrechecks.evaluateTrailing(
      expression,
      resource,
      state.fhirVersion,
    );
    if (trailingMemberOf !== null) {
      return this.outcome(trailingMemberOf, resource, elementPath, constraint, profileUrl, state);
    }

    const resolvedContext = resolveConstraintContext(resource, elementPath, expression);
    const resolvableExpression = terminologyResolverConfigured
      ? this.memberOfPrechecks.rewriteLegacyExpression(resolvedContext.expression)
      : resolvedContext.expression;
    const optionalMemberOfUnion = this.memberOfPrechecks.evaluateOptional(
      resolvableExpression,
      resolvedContext.context,
    );
    if (optionalMemberOfUnion !== null) {
      return this.outcome(optionalMemberOfUnion, resource, elementPath, constraint, profileUrl, state);
    }

    const resolveExists = evaluateResolveExistsConstraint({
      expression: resolvedContext.expression,
      context: resolvedContext.context,
      rootResource: state.rootResource ?? resource,
      fhirVersion: state.fhirVersion,
      bundle: state.bundle,
      expressionCache: this.expressionCache,
    });
    if (resolveExists !== null) {
      return this.outcome(resolveExists, resource, elementPath, constraint, profileUrl, state);
    }

    return {
      handled: false,
      context: resolvedContext.context,
      expression: resolvableExpression,
    };
  }

  private outcome(
    passed: boolean,
    resource: FhirResource,
    elementPath: string,
    constraint: Constraint,
    profileUrl: string,
    state: ConstraintValidationState,
  ): ConstraintPrecheckResult {
    return {
      handled: true,
      issues: constraintOutcomeIssues(
        passed,
        resource,
        elementPath,
        constraint,
        profileUrl,
        state.strictnessMode,
      ),
    };
  }
}
