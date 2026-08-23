import type { CodeSystemValidationResult } from './terminology-api-client';
import type { ValueSetCache } from './valueset-cache';
import {
  fhirVersionToPackageMajor,
  findCodeSystemConcept,
  isAssertableCodeSystem,
} from './valueset-code-system-rules';
import { displaysEquivalentForCodeInfo } from './valueset-display-utils';
import type { FhirVersion } from './valueset-expansion-cache-key';
import type { ValueSetPackageLoader } from './valueset-package-loader';

interface LocalCodeSystemValidationDeps {
  cache: ValueSetCache;
  packageLoader: ValueSetPackageLoader;
}

export async function validateCodeInLocalCodeSystem(
  deps: LocalCodeSystemValidationDeps,
  code: string,
  system: string,
  display?: string,
  fhirVersion?: FhirVersion,
): Promise<CodeSystemValidationResult | null> {
  const codeSystem = deps.cache.getCodeSystem(system)
    ?? deps.cache.getCodeSystemFile(system)
    ?? await deps.packageLoader.loadCodeSystem(
      system,
      fhirVersionToPackageMajor(fhirVersion),
    );
  if (!codeSystem || !isAssertableCodeSystem(codeSystem)) return null;

  const concept = findCodeSystemConcept(codeSystem.concept, code);
  if (!concept) {
    const incompleteCodeSystem = codeSystem.content === 'fragment';
    return {
      valid: false,
      reason: 'code-unknown',
      incompleteCodeSystem,
      message:
        `Unknown code '${code}' in CodeSystem '${system}'` +
        `${codeSystem.version ? ` version '${codeSystem.version}'` : ''}` +
        (incompleteCodeSystem
          ? '; the CodeSystem is a fragment, so the code may exist in another fragment'
          : ''),
    };
  }

  const acceptedDisplays = [
    concept.display,
    ...(concept.designation ?? []).map(designation => designation.value),
  ].filter((value): value is string => Boolean(value?.trim()));

  if (
    display &&
    acceptedDisplays.length > 0 &&
    !acceptedDisplays.some(expected => (
      displaysEquivalentForCodeInfo(expected, display, { code, system })
    ))
  ) {
    const expectedDisplay = acceptedDisplays[0];
    const message = (
      `Wrong Display Name '${display}' for ${system}#${code}. ` +
      `Valid display is '${expectedDisplay}'`
    );
    return {
      valid: false,
      reason: 'display-mismatch',
      display: expectedDisplay,
      message,
      issues: [{
        severity: 'error',
        code: 'invalid-display',
        message,
        source: 'local-code-system',
      }],
    };
  }

  return { valid: true, display: concept.display };
}
