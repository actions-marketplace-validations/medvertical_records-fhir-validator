import type { ReferenceResolver } from '../validators/slicing-validator';
import type { MultiAspectDeps } from './multi-aspect-dependencies';
import type { MultiAspectValidateResult } from './multi-aspect-types';
import { MultiAspectValidationSession } from './multi-aspect-validation-session';

/** Compose one isolated validation session, including its profile cache and recursive context. */
export function buildMultiAspectValidateCallback(
  deps: MultiAspectDeps,
  aspects: string[],
  settings: unknown,
  organizationId?: number,
  shouldStop?: () => boolean,
  onEmbeddedResourceValidated?: (
    resource: Record<string, unknown>,
    result: MultiAspectValidateResult,
  ) => void | Promise<void>,
  externalReferenceResolver?: ReferenceResolver,
  serverId?: number,
): (
  resource: unknown,
  profileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
) => Promise<MultiAspectValidateResult> {
  return new MultiAspectValidationSession({
    deps,
    aspects,
    settings,
    organizationId,
    shouldStop,
    onEmbeddedResourceValidated,
    externalReferenceResolver,
    serverId,
  }).validate;
}
