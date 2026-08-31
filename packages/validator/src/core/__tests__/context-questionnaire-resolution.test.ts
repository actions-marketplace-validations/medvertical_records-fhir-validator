import { afterEach, describe, expect, it, vi } from 'vitest';
import { setProfileSource } from '../../persistence';
import { resolveContextQuestionnaire } from '../context-questionnaire-resolution';
import { QuestionnaireContextRegistry } from '../questionnaire-context-registry';

describe('resolveContextQuestionnaire', () => {
  afterEach(() => {
    setProfileSource({});
  });

  it('resolves a versioned Questionnaire canonical from the tenant package source', async () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      id: 'phq-9',
      url: 'https://example.org/Questionnaire/phq-9',
      version: '2026.3.0',
      status: 'active',
    };
    const findCanonicalResource = vi.fn().mockResolvedValue(questionnaire);
    setProfileSource({ findCanonicalResource });

    const resolved = await resolveContextQuestionnaire(
      {
        resourceType: 'QuestionnaireResponse',
        questionnaire: `${questionnaire.url}|${questionnaire.version}`,
      },
      new QuestionnaireContextRegistry(),
      { organizationId: 7, serverId: 314, fhirVersion: 'R4' },
    );

    expect(resolved).toBe(questionnaire);
    expect(findCanonicalResource).toHaveBeenCalledWith(
      questionnaire.url,
      'Questionnaire',
      questionnaire.version,
      { organizationId: 7, serverId: 314, fhirVersion: 'R4' },
    );
  });

  it('rejects a host resource with a mismatching canonical identity', async () => {
    setProfileSource({
      findCanonicalResource: vi.fn().mockResolvedValue({
        resourceType: 'Questionnaire',
        url: 'https://example.org/Questionnaire/other',
      }),
    });

    await expect(resolveContextQuestionnaire(
      {
        resourceType: 'QuestionnaireResponse',
        questionnaire: 'https://example.org/Questionnaire/requested',
      },
      new QuestionnaireContextRegistry(),
      { organizationId: 7, serverId: 314, fhirVersion: 'R4' },
    )).resolves.toBeUndefined();
  });

  it('bounds registered questionnaire aliases with LRU eviction', () => {
    const registry = new QuestionnaireContextRegistry(2);
    registry.register({
      resourceType: 'Questionnaire',
      url: 'https://example.org/Questionnaire/first',
    });
    registry.register({
      resourceType: 'Questionnaire',
      url: 'https://example.org/Questionnaire/second',
    });
    expect(registry.get('https://example.org/Questionnaire/first')).not.toBeNull();

    registry.register({
      resourceType: 'Questionnaire',
      url: 'https://example.org/Questionnaire/third',
    });

    expect(registry.get('https://example.org/Questionnaire/second')).toBeNull();
    expect(registry.get('https://example.org/Questionnaire/first')).not.toBeNull();
    expect(registry.get('https://example.org/Questionnaire/third')).not.toBeNull();
  });
});
