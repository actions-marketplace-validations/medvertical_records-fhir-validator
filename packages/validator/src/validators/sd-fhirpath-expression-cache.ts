import fhirpath from 'fhirpath';

import { getFhirPathModel } from '../core/fhirpath-context';
import { rewriteCollectionTypeOperators } from './fhirpath-as-operator-rewrite';
import { logger } from '../logger';
import { VersionedExpressionCache } from './fhirpath-expression-cache-core';

export const sdFHIRPathExpressionCache = new VersionedExpressionCache<any | null>({
    maxSize: 1000,
    keySeparator: ':',
    compile: (expression, fhirVersion) =>
        fhirpath.compile(rewriteCollectionTypeOperators(expression), getFhirPathModel(fhirVersion)),
    onCompileError: (expression, error) => {
        logger.warn(`[SDFHIRPathExecutor] Failed to compile: ${expression}`, error);
    },
    errorValue: () => null,
});
