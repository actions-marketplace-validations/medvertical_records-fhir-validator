import { describe, expect, it, vi } from 'vitest';
import type { StructureDefinitionLoader } from '../structure-definition-loader';
import type { StructureDefinition } from '../structure-definition-types';
import { prepareSingleResourceProfile } from '../single-resource-profile-preparation';

function profile(url: string, type: string): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url,
    name: type,
    status: 'active',
    kind: 'resource',
    abstract: false,
    type,
    snapshot: { element: [{ path: type }] },
  };
}

function loader(profiles: StructureDefinition[]): {
  value: StructureDefinitionLoader;
  loadProfile: ReturnType<typeof vi.fn>;
  setProfileResolutionContext: ReturnType<typeof vi.fn>;
} {
  const byUrl = new Map(profiles.map(candidate => [candidate.url, candidate]));
  const loadProfile = vi.fn(async (url: string) => byUrl.get(url) ?? null);
  const setProfileResolutionContext = vi.fn();
  return {
    value: {
      loadProfile,
      setProfileResolutionContext,
      getAvailableProfiles: () => [...byUrl.keys()],
    } as unknown as StructureDefinitionLoader,
    loadProfile,
    setProfileResolutionContext,
  };
}

describe('single resource profile preparation', () => {
  it('loads the base profile and reports an unresolved explicit profile', async () => {
    const baseUrl = 'http://hl7.org/fhir/StructureDefinition/Observation';
    const unresolvedUrl = 'https://example.test/StructureDefinition/missing';
    const sdLoader = loader([profile(baseUrl, 'Observation')]);
    const settings = { profileResolution: { strategy: 'local-only' } } as never;
    const profileSourceContext = { organizationId: 7, serverId: 9, fhirVersion: 'R4' as const };

    const result = await prepareSingleResourceProfile(
      {
        resource: { resourceType: 'Observation' },
        explicitProfileUrl: unresolvedUrl,
        fhirVersion: 'R4',
        settings,
        profileSourceContext,
      },
      {
        sdLoader: sdLoader.value,
        snapshotGenerator: {} as never,
      },
    );

    expect(result.structureDef?.url).toBe(baseUrl);
    expect(result.declaredProfileUrl).toBe(unresolvedUrl);
    expect(result.profileFallbackIssue).toMatchObject({
      code: 'profile-not-resolved',
      profile: unresolvedUrl,
    });
    expect(sdLoader.setProfileResolutionContext).toHaveBeenCalledWith(
      profileSourceContext,
      settings,
    );
  });

  it('uses a code-inferred profile before the resource base profile', async () => {
    const inferredUrl = 'http://hl7.org/fhir/StructureDefinition/vitalspanel';
    const sdLoader = loader([profile(inferredUrl, 'Observation')]);

    const result = await prepareSingleResourceProfile(
      {
        resource: {
          resourceType: 'Observation',
          code: { coding: [{ system: 'http://loinc.org', code: '85353-1' }] },
        },
        fhirVersion: 'R4',
        profileSourceContext: { fhirVersion: 'R4' },
      },
      {
        sdLoader: sdLoader.value,
        snapshotGenerator: {} as never,
      },
    );

    expect(result.declaredProfileUrl).toBe(inferredUrl);
    expect(result.structureDef?.url).toBe(inferredUrl);
    expect(result.profileFallbackIssue).toBeNull();
    expect(result.codeInferredProfile).toEqual({
      profileUrl: inferredUrl,
      system: 'http://loinc.org',
      code: '85353-1',
    });
    expect(sdLoader.loadProfile).toHaveBeenCalledTimes(1);
  });

  it('does not report code inference for a declared profile, even with a triggering code', async () => {
    const declaredUrl = 'http://hl7.org/fhir/StructureDefinition/bp';
    const sdLoader = loader([profile(declaredUrl, 'Observation')]);

    const result = await prepareSingleResourceProfile(
      {
        resource: {
          resourceType: 'Observation',
          meta: { profile: [declaredUrl] },
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
        },
        fhirVersion: 'R4',
        profileSourceContext: { fhirVersion: 'R4' },
      },
      {
        sdLoader: sdLoader.value,
        snapshotGenerator: {} as never,
      },
    );

    expect(result.declaredProfileUrl).toBe(declaredUrl);
    expect(result.codeInferredProfile).toBeNull();
  });

  it('withdraws code inference when the inferred profile falls back to the base SD', async () => {
    const baseUrl = 'http://hl7.org/fhir/StructureDefinition/Observation';
    const sdLoader = loader([profile(baseUrl, 'Observation')]);

    const result = await prepareSingleResourceProfile(
      {
        resource: {
          resourceType: 'Observation',
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
        },
        fhirVersion: 'R4',
        profileSourceContext: { fhirVersion: 'R4' },
      },
      {
        sdLoader: sdLoader.value,
        snapshotGenerator: {} as never,
      },
    );

    expect(result.structureDef?.url).toBe(baseUrl);
    expect(result.profileFallbackIssue).toMatchObject({ code: 'profile-not-resolved' });
    expect(result.codeInferredProfile).toBeNull();
  });

  it('resolves a registered Questionnaire for QuestionnaireResponse validation', async () => {
    const baseUrl = 'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse';
    const sdLoader = loader([profile(baseUrl, 'QuestionnaireResponse')]);
    const questionnaire = { resourceType: 'Questionnaire', id: 'registered' };
    const resolveForResponse = vi.fn(() => questionnaire);

    const result = await prepareSingleResourceProfile(
      {
        resource: { resourceType: 'QuestionnaireResponse' },
        fhirVersion: 'R4',
        profileSourceContext: { fhirVersion: 'R4' },
      },
      {
        sdLoader: sdLoader.value,
        snapshotGenerator: {} as never,
        questionnaireRegistry: { resolveForResponse } as never,
      },
    );

    expect(result.contextQuestionnaire).toBe(questionnaire);
    expect(resolveForResponse).toHaveBeenCalledWith({
      resourceType: 'QuestionnaireResponse',
    });
  });
});
