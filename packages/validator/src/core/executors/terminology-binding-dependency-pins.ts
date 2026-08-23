/**
 * Cross-IG counterpart to `pinBindingToProfileVersion`: a profile's binding
 * to a ValueSet from a *dependency* IG must resolve to the version that IG
 * release was published against, not to whichever package version is newest
 * in the local stores. The profile's provenance (recorded when it was loaded
 * from a package) selects its IG's dependency pins; the binding canonical is
 * version-qualified so the ValueSet loader's exact-match/same-major/cross-
 * major machinery — and its version-keyed caches — stay authoritative.
 */
import {
  derivePackagePinContext,
  isPinExemptCanonical,
  resolvePinnedVersionForCanonical,
} from '../../package/canonical-pin-context';
import { lookupProfilePackageProvenance } from '../../package/canonical-pin-provenance';
import { resolveValueSetPackageDirectories } from '../../validators/valueset-package-resource-access';
import type { Binding, StructureDefinition } from '../structure-definition-types';

export async function pinBindingToDependencyPins<T extends Binding | undefined>(
  binding: T,
  structureDef: Pick<StructureDefinition, 'url' | 'version'>,
  fhirVersion?: 'R4' | 'R5' | 'R6',
): Promise<T> {
  if (!binding?.valueSet || isPinExemptCanonical(binding.valueSet)) return binding;

  const provenance = lookupProfilePackageProvenance(structureDef.url, structureDef.version);
  if (!provenance) return binding;

  const storeDirs = resolveValueSetPackageDirectories();
  const context = await derivePackagePinContext(storeDirs, provenance);
  if (!context) return binding;

  const pinnedVersion = await resolvePinnedVersionForCanonical(
    storeDirs,
    context,
    binding.valueSet,
    fhirVersion,
  );
  if (!pinnedVersion) return binding;
  return { ...binding, valueSet: `${binding.valueSet}|${pinnedVersion}` };
}
