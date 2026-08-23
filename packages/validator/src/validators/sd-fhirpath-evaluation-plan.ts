import type { ValidationIssue } from '../types';
import type { SDFHIRPathTargetEvaluation } from './sd-fhirpath-expression-runtime';

export interface SDFHIRPathEvaluationPlan {
  immediateIssues?: ValidationIssue[];
  resolveTargets(): SDFHIRPathTargetEvaluation[];
}
