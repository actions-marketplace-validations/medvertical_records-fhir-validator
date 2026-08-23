import { logger } from '../logger';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { profileCanonicalMetadata } from '../utils/sensitive-logging-metadata';
import { validationFailureMetadata } from '../utils/validation-execution-failure';
import { extractSubExtensionDefinitions } from './extension-definition-extractor';
import type { ExtensionProfileCache } from './extension-profile-cache';
import type { ExtensionDefinition } from './extension-types';

/** Load and cache the nested definitions owned by one extension profile. */
export async function getSubExtensionDefinitions(
  parentProfileUrl: string,
  fhirVersion: 'R4' | 'R5' | 'R6',
  sdLoader: StructureDefinitionLoader,
  cache: ExtensionProfileCache<Map<string, ExtensionDefinition>>,
): Promise<Map<string, ExtensionDefinition>> {
  const cacheKey = `${fhirVersion}|${parentProfileUrl}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let parentSD: StructureDefinition | null = null;
  try {
    parentSD = await sdLoader.loadProfile(parentProfileUrl, fhirVersion);
  } catch (error: unknown) {
    logger.warn('[ExtensionValidator] Failed to load parent extension profile', {
      ...profileCanonicalMetadata(parentProfileUrl),
      ...validationFailureMetadata(error),
    });
  }

  const result = new Map<string, ExtensionDefinition>();
  if (!parentSD) return result;

  for (const [url, definition] of extractSubExtensionDefinitions(parentSD)) {
    result.set(url, definition);
  }

  cache.set(cacheKey, result);
  logger.debug('[ExtensionValidator] Extracted sub-extension definitions', {
    ...profileCanonicalMetadata(parentProfileUrl),
    definitionCount: result.size,
  });
  return result;
}
