import type { ConstraintExpressionCache } from './constraint-expression-cache';
import {
  evaluateOptionalMemberOfUnion,
  evaluateSimpleMemberOfExists,
  evaluateTrailingMemberOf,
  rewriteLegacyValueSetInExists,
  type MemberOfPrecheckResult,
} from './fhirpath-memberof-precheck';
import type { ValueSetCache } from './valueset-cache';
import { ValueSetPackageLoader } from './valueset-package-loader';

type FhirVersion = 'R4' | 'R5' | 'R6';

/** Owns the cache-backed MemberOf special cases used before general FHIRPath evaluation. */
export class ConstraintMemberOfPrechecks {
  private readonly valueSetLoader: ValueSetPackageLoader;

  constructor(
    private readonly valueSetCache: ValueSetCache,
    private readonly expressionCache: ConstraintExpressionCache,
  ) {
    this.valueSetLoader = new ValueSetPackageLoader(valueSetCache);
  }

  evaluateSimple(
    expression: string,
    resource: unknown,
    resourceType: string,
    fhirVersion: FhirVersion,
    deferUnavailableTerminology: boolean,
  ): Promise<MemberOfPrecheckResult> {
    return evaluateSimpleMemberOfExists(
      expression,
      resource,
      resourceType,
      this.valueSetLoader,
      fhirVersion,
      deferUnavailableTerminology,
    );
  }

  evaluateTrailing(
    expression: string,
    resource: unknown,
    fhirVersion: FhirVersion,
  ): MemberOfPrecheckResult {
    return evaluateTrailingMemberOf(
      expression,
      resource,
      fhirVersion,
      this.valueSetCache,
      this.expressionCache,
    );
  }

  rewriteLegacyExpression(expression: string): string {
    return rewriteLegacyValueSetInExists(expression);
  }

  evaluateOptional(
    expression: string,
    context: unknown,
  ): MemberOfPrecheckResult {
    return evaluateOptionalMemberOfUnion(
      expression,
      context,
      this.valueSetCache,
    );
  }
}
