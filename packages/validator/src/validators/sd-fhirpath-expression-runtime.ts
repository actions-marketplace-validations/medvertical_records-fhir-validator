import {
  AsyncFHIRPathTerminologyCache,
  evaluateAsyncFHIRPathTerminology,
  hasAsyncFHIRPathTerminology,
  type FHIRPathTerminologyResolver,
} from './fhirpath-async-terminology';
import { prepareElementContext } from './sd-fhirpath-choice-utils';
import {
  evaluateConstraintTarget,
  type ConstraintTargetEvaluation,
} from './sd-fhirpath-constraint-target';
import { SDFHIRPathExpressionCache } from './sd-fhirpath-expression-cache';
import { evaluateCompiledSDFHIRPath } from './sd-fhirpath-runtime';
import type { ValueSetCache } from './valueset-cache';
import { ValueSetPackageLoader } from './valueset-package-loader';

type FhirVersion = 'R4' | 'R5' | 'R6';

export type SDFHIRPathTargetEvaluation = Omit<
  ConstraintTargetEvaluation,
  'evaluateExpression' | 'expressionCache' | 'memberOfValueSetLoader' | 'valueSetCache'
>;

/** Owns the executable FHIRPath and terminology dependencies for constraint targets. */
export class SDFHIRPathExpressionRuntime {
  private readonly asyncExpressionCache = new AsyncFHIRPathTerminologyCache();
  private readonly memberOfValueSetLoader: ValueSetPackageLoader;

  constructor(
    private readonly valueSetCache: ValueSetCache,
    private readonly expressionCache: SDFHIRPathExpressionCache,
  ) {
    this.memberOfValueSetLoader = new ValueSetPackageLoader(valueSetCache);
  }

  evaluateTarget(
    target: SDFHIRPathTargetEvaluation,
  ): ReturnType<typeof evaluateConstraintTarget> {
    return evaluateConstraintTarget({
      ...target,
      memberOfValueSetLoader: this.memberOfValueSetLoader,
      valueSetCache: this.valueSetCache,
      expressionCache: this.expressionCache,
      evaluateExpression: (...args) => this.evaluateExpression(...args),
    });
  }

  private evaluateExpression(
    expression: string,
    context: unknown,
    rootResource: unknown,
    userInvocationTable?: unknown,
    fhirVersion: FhirVersion = 'R4',
    terminologyResolver?: FHIRPathTerminologyResolver,
  ): unknown | Promise<unknown> {
    const preparedContext = prepareElementContext(context, expression);
    if (terminologyResolver && hasAsyncFHIRPathTerminology(expression)) {
      return evaluateAsyncFHIRPathTerminology({
        expression,
        context: preparedContext,
        rootResource,
        fhirVersion,
        resolver: terminologyResolver,
        userInvocationTable,
        expressionCache: this.asyncExpressionCache,
      });
    }

    const compiled = this.expressionCache.getOrCompile(expression, fhirVersion);
    if (!compiled) throw new Error(`Failed to compile FHIRPath expression: ${expression}`);
    return evaluateCompiledSDFHIRPath(
      compiled,
      preparedContext,
      rootResource,
      userInvocationTable,
    );
  }
}
