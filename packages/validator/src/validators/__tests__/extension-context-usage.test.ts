import { describe, expect, it, vi } from 'vitest';
import { validateExtensionContextUsage } from '../extension-context-usage';
import type { NormalizedExtensionContext } from '../extension-context-matching';

const site = {
  resourceType: 'ArtifactAssessment',
  elementPath: 'ArtifactAssessment',
  attachment: 'resource-root' as const,
};

function runCheck(
  contexts: NormalizedExtensionContext[] | null,
  url = 'http://hl7.org/fhir/StructureDefinition/artifact-author',
) {
  return validateExtensionContextUsage({
    url,
    path: 'ArtifactAssessment.extension[0]',
    site,
    resourceType: 'ArtifactAssessment',
    fhirVersion: 'R5',
    getDeclaredContexts: async () => contexts,
  });
}

describe('validateExtensionContextUsage', () => {
  it('emits an error when no declared context covers the usage site', async () => {
    const issues = await runCheck([
      { type: 'element', expression: 'CapabilityStatement' },
      { type: 'element', expression: 'CodeSystem' },
    ]);
    expect(issues).toEqual([expect.objectContaining({
      code: 'profile-extension-context-wrong',
      severity: 'error',
      aspect: 'profile',
      path: 'ArtifactAssessment.extension[0]',
    })]);
    expect(issues[0].message).toContain('artifact-author');
    expect(issues[0].message).toContain('e:CapabilityStatement');
  });

  it('stays silent when a context matches or cannot be evaluated', async () => {
    expect(await runCheck([{ type: 'element', expression: 'ArtifactAssessment' }])).toEqual([]);
    expect(await runCheck([
      { type: 'element', expression: 'CodeSystem' },
      { type: 'fhirpath', expression: 'ArtifactAssessment.content.where(type.exists())' },
    ])).toEqual([]);
  });

  it('stays silent for unresolvable extensions and context-free definitions', async () => {
    expect(await runCheck(null)).toEqual([]);
    expect(await runCheck([])).toEqual([]);
  });

  it('does not resolve relative or versioned urls', async () => {
    const getDeclaredContexts = vi.fn(async () => null);
    await validateExtensionContextUsage({
      url: 'period',
      path: 'Patient.extension[0].extension[1]',
      site,
      resourceType: 'Patient',
      fhirVersion: 'R4',
      getDeclaredContexts,
    });
    await validateExtensionContextUsage({
      url: 'http://hl7.org/fhir/StructureDefinition/artifact-author|5.3.0',
      path: 'Patient.extension[0]',
      site,
      resourceType: 'Patient',
      fhirVersion: 'R4',
      getDeclaredContexts,
    });
    expect(getDeclaredContexts).not.toHaveBeenCalled();
  });
});
