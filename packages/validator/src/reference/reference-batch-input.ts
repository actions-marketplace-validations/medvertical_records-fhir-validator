import { extractReferencesFromBundle, extractReferencesFromResource } from './reference-extraction';
import { parseReference } from './reference-type-extractor';
import type { ParsedReferenceCheck } from './reference-batch-types';

export function parseReferenceBatch(references: string[]): ParsedReferenceCheck[] {
  return references.map(reference => ({
    reference,
    parseResult: parseReference(reference),
  }));
}

export function extractResourceReferenceBatch(resource: unknown): string[] {
  return extractReferencesFromResource(resource);
}

export function extractBundleReferenceBatch(bundle: unknown): string[] {
  return extractReferencesFromBundle(bundle);
}
