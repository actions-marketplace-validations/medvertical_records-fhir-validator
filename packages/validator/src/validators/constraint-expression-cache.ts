import fhirpath from 'fhirpath';
import { getFhirPathModel } from './fhirpath-model-resolver';
import { rewriteCollectionTypeOperators } from './fhirpath-as-operator-rewrite';
import {
  VersionedExpressionCache,
  type FHIRPathExpressionCacheStats,
} from './fhirpath-expression-cache-core';

const expressionCache = new VersionedExpressionCache<any>({
  maxSize: 500,
  compile: (expression, fhirVersion) =>
    fhirpath.compile(rewriteCollectionTypeOperators(expression), getFhirPathModel(fhirVersion)),
});

export function getOrCompileFHIRPathExpression(
  expression: string,
  fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
): any {
  return expressionCache.getOrCompile(expression, fhirVersion);
}

export function getConstraintExpressionCacheStats(): FHIRPathExpressionCacheStats {
  return expressionCache.getStats();
}

export function clearConstraintExpressionCache(): void {
  expressionCache.clear();
}
