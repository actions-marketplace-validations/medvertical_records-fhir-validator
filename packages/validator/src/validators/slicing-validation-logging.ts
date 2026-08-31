import { logger } from '../logger';
import { sensitiveValueMetadata } from '../utils/sensitive-logging-metadata';

export function logSlicingValidationStart(
  elementCount: number,
  compatibleSliceCount: number,
  elementPath: string,
): void {
  logger.debug('[SlicingValidator] Validating sliced elements', {
    elementCount,
    compatibleSliceCount,
    ...sensitiveValueMetadata(elementPath),
  });
}
