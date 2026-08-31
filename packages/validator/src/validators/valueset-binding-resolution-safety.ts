import { logger } from '../logger';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { recordTerminologyReason } from './valueset-diagnostics';
import type { CodeBindingOutcome, TerminologyDiagnostics } from './valueset-types';

export async function resolveCodeBindingSafely(
  resolve: () => Promise<CodeBindingOutcome>,
  terminologyDiagnostics: TerminologyDiagnostics,
): Promise<CodeBindingOutcome> {
  try {
    return await resolve();
  } catch (error: unknown) {
    logger.warn(
      '[ValueSetValidator] Binding validation failed, treating as unverified',
      validationFailureMetadata(error),
    );
    recordTerminologyReason(terminologyDiagnostics.unverifiedBindings, 'validation-error');
    return 'unverified';
  }
}
