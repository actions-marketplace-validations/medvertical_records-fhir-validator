import { BoundedLruCache } from '../cache/bounded-lru-cache';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import {
  extractExtensionContexts,
  type NormalizedExtensionContext,
} from './extension-context-matching';

export class ExtensionUrlResolver {
  private readonly resolvedUrls = new BoundedLruCache<string, true>(1_024);
  private readonly declaredContexts =
    new BoundedLruCache<string, NormalizedExtensionContext[] | 'none'>(1_024);

  constructor(private readonly sdLoader: StructureDefinitionLoader) {}

  async isResolvable(url: string, fhirVersion: 'R4' | 'R5' | 'R6'): Promise<boolean> {
    const cacheKey = `${fhirVersion}|${url}`;
    if (this.resolvedUrls.get(cacheKey)) return true;
    const resolvable = Boolean(await this.loadWithVersionFallback(url, fhirVersion));

    // Misses intentionally remain uncached so newly installed packages can
    // make a previously unresolved extension available without a reset.
    if (resolvable) this.resolvedUrls.set(cacheKey, true);
    return resolvable;
  }

  /**
   * Declared usage contexts of a resolvable extension, or null when the
   * extension cannot be resolved or declares no contexts. Unresolved URLs are
   * not negative-cached, mirroring isResolvable.
   */
  async getDeclaredContexts(
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<NormalizedExtensionContext[] | null> {
    const cacheKey = `${fhirVersion}|${url}`;
    const cached = this.declaredContexts.get(cacheKey);
    if (cached) return cached === 'none' ? null : cached;

    const definition = await this.loadWithVersionFallback(url, fhirVersion);
    if (!definition) return null;

    const contexts = extractExtensionContexts(definition);
    this.declaredContexts.set(cacheKey, contexts ?? 'none');
    return contexts;
  }

  private async loadWithVersionFallback(
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<StructureDefinition | null> {
    let definition = await this.tryLoad(url, fhirVersion);

    // Some well-known HL7 extensions ship in R4 core but not in later core
    // packages. Use the R4 definition as a compatibility fallback.
    if (
      !definition
      && fhirVersion !== 'R4'
      && url.startsWith('http://hl7.org/fhir/StructureDefinition/')
    ) {
      definition = await this.tryLoad(url, 'R4');
    }
    return definition;
  }

  private async tryLoad(
    url: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<StructureDefinition | null> {
    try {
      return await this.sdLoader.loadProfile(url, fhirVersion) ?? null;
    } catch {
      return null;
    }
  }
}
