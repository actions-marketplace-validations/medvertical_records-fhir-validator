import type { FhirVersion } from './valueset-expansion-cache-key';
import type { CodeSystemValidationResult } from './terminology-api-client';
import type {
  CodeSystem,
  CodeSystemConcept,
  TerminologyResolutionConfig,
} from './valueset-types';

export function fhirVersionToPackageMajor(fhirVersion?: FhirVersion): string | undefined {
  if (fhirVersion === 'R4') return '4';
  if (fhirVersion === 'R5') return '5';
  if (fhirVersion === 'R6') return '6';
  return undefined;
}

export function isAssertableCodeSystem(codeSystem: CodeSystem): boolean {
  return codeSystem.content !== 'not-present' && codeSystem.content !== 'supplement';
}

export function findCodeSystemConcept(
  concepts: CodeSystemConcept[] | undefined,
  code: string,
): CodeSystemConcept | null {
  if (!concepts) return null;
  for (const concept of concepts) {
    if (concept.code === code) return concept;
    const nested = findCodeSystemConcept(concept.concept, code);
    if (nested) return nested;
  }
  return null;
}

export function buildUnverifiableCodeSystemResult(
  code: string,
  system: string,
  result: CodeSystemValidationResult,
  config: TerminologyResolutionConfig,
): CodeSystemValidationResult | null {
  if (result.reason !== 'code-unknown') return null;
  const preferredServerEnabled = (config.servers ?? []).some(server =>
    server.enabled && !server.circuitOpen && server.preferredSystems?.includes(system)
  );
  const isUnverifiable =
    (system === 'http://loinc.org' && /^LA\d+-\d$/.test(code)) ||
    (system === 'http://www.genenames.org/geneId' &&
      code.split('::').length >= 2 &&
      code.split('::').every(component => /^HGNC:\d+$/.test(component))) ||
    (system === 'http://snomed.info/sct' && !preferredServerEnabled);
  if (!isUnverifiable) return null;

  if (system === 'http://loinc.org') {
    return {
      valid: false,
      reason: 'system-unresolvable',
      message: `Could not verify LOINC answer-list code '${code}'. The configured terminology source ` +
        'does not expose a complete LOINC answer-list CodeSystem.',
    };
  }
  if (system === 'http://www.genenames.org/geneId') {
    return {
      valid: false,
      reason: 'system-unresolvable',
      message: `Could not verify composite HGNC fusion code '${code}' as a single terminology concept. ` +
        'Validate its individual HGNC components instead.',
    };
  }
  return {
    valid: false,
    reason: 'system-unresolvable',
    message: `Could not verify SNOMED CT code '${code}' against an authoritative unversioned SNOMED edition. ` +
      'Configure a SNOMED-preferred terminology server or provide a versioned Coding.version to enforce code membership.',
  };
}
