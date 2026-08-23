import type { ProfileCache } from '../cache/profile-cache';
import { logger } from '../logger';
import { applyResourcePinToCanonical } from '../package/canonical-pin-context';
import type { ProfileSourceContext } from '../persistence';
import type { ValidationIssue, ValidationSettings } from '../types';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import { matchCodeInferredProfile, type CodeInferredProfileMatch } from './code-inferred-profiles';
import { resolveContextQuestionnaire } from './context-questionnaire-resolution';
import { getPrimaryDeclaredProfile } from './declared-profile-utils';
import type { FhirResource } from './fhir-resource';
import {
  createProfileFallbackIssue,
  createProfileResourceTypeMismatchIssue,
  loadProfileOrBase,
  type FhirClientLike,
} from './profile-loader-utils';
import type { QuestionnaireContextRegistry } from './questionnaire-context-registry';
import type { SnapshotGenerator } from './snapshot-generator';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { StructureDefinition } from './structure-definition-types';

export type { FhirClientLike } from './profile-loader-utils';

export interface SingleResourceProfilePreparationInput {
  resource: FhirResource;
  explicitProfileUrl?: string;
  fhirVersion: 'R4' | 'R5' | 'R6';
  settings?: ValidationSettings;
  fhirClient?: FhirClientLike;
  profileSourceContext: ProfileSourceContext;
}

export interface SingleResourceProfilePreparationDependencies {
  sdLoader: StructureDefinitionLoader;
  profileCache?: ProfileCache;
  snapshotGenerator: SnapshotGenerator;
  questionnaireRegistry?: QuestionnaireContextRegistry;
}

export interface SingleResourceProfilePreparationResult {
  declaredProfileUrl: string;
  structureDef: StructureDefinition | null;
  profileFallbackIssue: ValidationIssue | null;
  /** Set when the profile was selected from Observation.code, not by the caller or resource. */
  codeInferredProfile: CodeInferredProfileMatch | null;
  contextQuestionnaire?: Record<string, unknown>;
}

export async function prepareSingleResourceProfile(
  input: SingleResourceProfilePreparationInput,
  dependencies: SingleResourceProfilePreparationDependencies,
): Promise<SingleResourceProfilePreparationResult> {
  const {
    resource,
    explicitProfileUrl,
    fhirVersion,
    settings,
    fhirClient,
    profileSourceContext,
  } = input;
  const {
    sdLoader,
    profileCache,
    snapshotGenerator,
    questionnaireRegistry,
  } = dependencies;

  sdLoader.setProfileResolutionContext(profileSourceContext, settings);
  const explicitOrDeclaredProfileUrl = explicitProfileUrl ?? getPrimaryDeclaredProfile(resource);
  const codeInferredProfile = explicitOrDeclaredProfileUrl
    ? null
    : matchCodeInferredProfile(resource);
  const declaredProfileUrl =
    explicitOrDeclaredProfileUrl
    ?? codeInferredProfile?.profileUrl
    ?? `http://hl7.org/fhir/StructureDefinition/${resource.resourceType}`;

  logger.debug('[RecordsValidator] Validating resource against profile', {
    resourceType: resource.resourceType,
    ...profileCanonicalMetadata(declaredProfileUrl),
  });

  // Resolution may be redirected to the version the resource's own IG pins;
  // reporting keeps the canonical exactly as the resource declared it.
  // Loader doubles without package sources simply resolve unpinned.
  const resolutionProfileUrl = await applyResourcePinToCanonical(
    sdLoader.getPackageSources?.() ?? [],
    resource,
    declaredProfileUrl,
    fhirVersion,
  );

  const loadResult = await loadProfileOrBase(
    sdLoader,
    snapshotGenerator,
    resolutionProfileUrl,
    resource.resourceType,
    fhirVersion,
    profileCache,
    fhirClient,
    profileSourceContext,
    settings,
  );
  if (!loadResult.structureDef) {
    return {
      declaredProfileUrl,
      structureDef: null,
      profileFallbackIssue: null,
      codeInferredProfile,
    };
  }

  const profileFallbackIssue = loadResult.incompatibleProfileType
    ? createProfileResourceTypeMismatchIssue(
      declaredProfileUrl,
      resource.resourceType,
      loadResult.incompatibleProfileType,
    )
    : loadResult.usedBaseFallback
      ? createProfileFallbackIssue(declaredProfileUrl, resource.resourceType, sdLoader)
      : null;
  const contextQuestionnaire = resource.resourceType === 'QuestionnaireResponse'
    ? await resolveContextQuestionnaire(
      resource,
      questionnaireRegistry,
      profileSourceContext,
    )
    : undefined;

  return {
    declaredProfileUrl,
    structureDef: loadResult.structureDef,
    profileFallbackIssue,
    // A fallback means validation ran against the base SD after all, so the
    // inferred profile must not claim the resulting findings.
    codeInferredProfile: profileFallbackIssue ? null : codeInferredProfile,
    contextQuestionnaire,
  };
}
