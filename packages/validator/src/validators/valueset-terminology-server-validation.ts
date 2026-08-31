import type { BindingStrength } from './valueset-display-utils';
import type { FhirVersion } from './valueset-expansion-cache-key';
import type { TerminologyApiClient } from './terminology-api-client';
import type { ValueSetPackageLoader } from './valueset-package-loader';
import type {
  CodeBindingOutcome,
  TerminologyServerOverride,
} from './valueset-types';
import { codeSystemCanonicalsEquivalent } from './code-system-canonical-aliases';

type ValidateCodeViaTerminologyServerOptions = {
  apiClient: TerminologyApiClient;
  packageLoader: ValueSetPackageLoader;
  hasTerminologyServer: (override?: { url: string }) => boolean;
  code: string;
  system: string | undefined;
  valueSetUrl: string;
  bindingStrength: BindingStrength | undefined;
  override: TerminologyServerOverride | undefined;
  fhirVersion?: FhirVersion;
  codeSystemVersion?: string;
};

export async function validateCodeViaTerminologyServerWithFilters({
  apiClient,
  packageLoader,
  hasTerminologyServer,
  code,
  system,
  valueSetUrl,
  bindingStrength,
  override,
  fhirVersion,
  codeSystemVersion,
}: ValidateCodeViaTerminologyServerOptions): Promise<CodeBindingOutcome> {
  const serverOutcome = await apiClient.validateCodeOutcome(
    code,
    system,
    valueSetUrl,
    bindingStrength,
    override,
    codeSystemVersion,
  );
  if (serverOutcome !== 'invalid') return serverOutcome;
  if (codeSystemVersion) return 'invalid';

  if (!system || !hasTerminologyServer(override)) return 'invalid';

  const filters = await packageLoader.getIncludeConceptFilters(valueSetUrl, fhirVersion);
  for (const filter of filters) {
    if (!codeSystemCanonicalsEquivalent(filter.system, system) || filter.property !== 'concept') continue;

    if (filter.op === '=' && filter.value === code) {
      return 'valid';
    }

    if (filter.op === 'is-a' || filter.op === 'descendent-of') {
      const outcome = await apiClient.subsumes(system, filter.value, code, override);
      if (outcome === 'subsumes') return 'valid';
      if (filter.op === 'is-a' && outcome === 'equivalent') return 'valid';
    }
  }

  return 'invalid';
}
