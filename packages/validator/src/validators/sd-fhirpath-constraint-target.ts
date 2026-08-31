import type { Constraint } from '../core/structure-definition-types';
import type { ValidationIssue } from '../types';
import { appendHtmlChecksConstraintIssues } from './fhirpath-html-checks';
import {
  evaluateSimpleMemberOfExists,
  evaluateTrailingMemberOf,
  rewriteLegacyValueSetInExists,
} from './fhirpath-memberof-precheck';
import { evaluateResolveExistsConstraint } from './fhirpath-resolve-precheck';
import { constraintPassed } from './sd-fhirpath-result-utils';
import { createConstraintViolation } from './sd-fhirpath-issue-factory';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import type { FHIRPathBundleInput } from './fhirpath-functions';
import type { FHIRPathTerminologyResolver } from './fhirpath-async-terminology';
import type { ValueSetCache } from './valueset-cache';
import type { SynchronousFHIRPathExpressionCache } from './constraint-expression-cache';

type FhirVersion = 'R4' | 'R5' | 'R6';

export interface ConstraintTargetEvaluation {
  constraint: Constraint;
  expression: string;
  context: unknown;
  rootResource: unknown;
  resolveRootResource: unknown;
  path: string;
  resourceType: string;
  userInvocationTable: unknown;
  profileUrl?: string;
  fhirVersion: FhirVersion;
  bundle?: FHIRPathBundleInput;
  checkHtml?: boolean;
  memberOfValueSetLoader: ValueSetPackageLoader;
  valueSetCache: ValueSetCache;
  expressionCache: SynchronousFHIRPathExpressionCache;
  terminologyResolver?: FHIRPathTerminologyResolver;
  evaluateExpression(
    expression: string,
    context: unknown,
    rootResource: unknown,
    userInvocationTable: unknown,
    fhirVersion: FhirVersion,
    terminologyResolver?: FHIRPathTerminologyResolver,
  ): unknown | Promise<unknown>;
}

export async function evaluateConstraintTarget(
  target: ConstraintTargetEvaluation,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  if (appendHtmlIssues(target, issues)) return issues;

  const memberOfPassed = await evaluateSimpleMemberOfExists(
    target.expression,
    target.context,
    target.resourceType,
    target.memberOfValueSetLoader,
    target.fhirVersion,
    Boolean(target.terminologyResolver),
  );
  if (memberOfPassed !== null) {
    return resultIssues(target, memberOfPassed);
  }

  const trailingMemberOf = evaluateTrailingMemberOf(
    target.expression,
    target.context,
    target.fhirVersion,
    target.valueSetCache,
    target.expressionCache,
  );
  if (trailingMemberOf !== null) {
    return resultIssues(target, trailingMemberOf);
  }

  const resolveExists = evaluateResolveExistsConstraint({
    expression: target.expression,
    context: target.context,
    rootResource: target.resolveRootResource,
    fhirVersion: target.fhirVersion,
    bundle: target.bundle,
    expressionCache: target.expressionCache,
  });
  if (resolveExists !== null) {
    return resultIssues(target, resolveExists);
  }

  const result = await target.evaluateExpression(
    target.terminologyResolver
      ? rewriteLegacyValueSetInExists(target.expression)
      : target.expression,
    target.context,
    target.rootResource,
    target.userInvocationTable,
    target.fhirVersion,
    target.terminologyResolver,
  );
  return resultIssues(target, constraintPassed(result));
}

function appendHtmlIssues(
  target: ConstraintTargetEvaluation,
  issues: ValidationIssue[],
): boolean {
  return target.checkHtml !== false && appendHtmlChecksConstraintIssues(
    issues,
    target.expression,
    target.context,
    target.path,
    target.resourceType,
    target.profileUrl,
  );
}

function resultIssues(
  target: ConstraintTargetEvaluation,
  passed: boolean,
): ValidationIssue[] {
  return passed
    ? []
    : [createConstraintViolation(
      target.constraint,
      target.path,
      target.resourceType,
      target.profileUrl,
    )];
}
