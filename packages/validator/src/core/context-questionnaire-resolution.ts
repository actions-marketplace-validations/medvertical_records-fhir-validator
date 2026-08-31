import {
  getProfileSource,
  type ProfileSourceContext,
} from '../persistence';
import type { QuestionnaireContextRegistry } from './questionnaire-context-registry';

type FhirResource = Record<string, unknown>;

export async function resolveContextQuestionnaire(
  response: unknown,
  registry: QuestionnaireContextRegistry | undefined,
  context: ProfileSourceContext,
): Promise<FhirResource | undefined> {
  const registered = registry?.resolveForResponse(response);
  if (registered) return registered;
  if (!isRecord(response) || response.resourceType !== 'QuestionnaireResponse') return undefined;
  if (typeof response.questionnaire !== 'string' || response.questionnaire.trim().length === 0) {
    return undefined;
  }

  const [canonicalUrl, version] = response.questionnaire.split('|');
  if (!canonicalUrl) return undefined;
  const source = getProfileSource();
  if (!source.findCanonicalResource) return undefined;

  try {
    const resource = await source.findCanonicalResource(
      canonicalUrl,
      'Questionnaire',
      version || undefined,
      context,
    );
    return isMatchingQuestionnaire(resource, canonicalUrl, version)
      ? resource
      : undefined;
  } catch {
    return undefined;
  }
}

function isMatchingQuestionnaire(
  resource: Record<string, unknown> | null,
  canonicalUrl: string,
  version: string | undefined,
): resource is FhirResource {
  if (!resource || resource.resourceType !== 'Questionnaire') return false;
  if (resource.url !== canonicalUrl) return false;
  return !version || resource.version === version;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
