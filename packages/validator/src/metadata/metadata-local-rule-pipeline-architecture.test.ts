import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/metadata', file),
    'utf8',
  );
}

describe('Metadata validation architecture', () => {
  it('separates local rules from delegation and coordinator policy', () => {
    const facade = readSource('metadata-validator-refactored.ts');
    const localRules = readSource('metadata-local-rule-pipeline.ts');
    const fieldRules = readSource('metadata-field-rule-set.ts');

    expect(facade).toMatch(/from ['"]\.\/metadata-local-rule-pipeline['"]/);
    expect(facade).not.toMatch(
      /from ['"]\.\/(?:completeness-checker|field-validators|profile-validators|provenance-chain-validator|security-validators|tag-validators|meta-field-validator)['"]/,
    );

    expect(localRules).toContain('class LocalMetadataRulePipeline');
    expect(localRules).toContain('MetadataFieldRuleSet');
    expect(localRules).toContain('validateRequiredMetadata');
    expect(localRules).toContain('validateProvenanceChain');
    expect(localRules).not.toMatch(
      /\b(?:LastUpdatedValidator|VersionIdValidator|SourceValidator|ProfileValidator|SecurityValidator|TagValidator)\b/,
    );
    expect(localRules).not.toMatch(/from ['"]\.\/metadata-validator-refactored['"]/);

    expect(fieldRules).toContain('class MetadataFieldRuleSet');
    expect(fieldRules).toMatch(/\bLastUpdatedValidator\b/);
    expect(fieldRules).toMatch(/\bVersionIdValidator\b/);
    expect(fieldRules).toMatch(/\bSourceValidator\b/);
    expect(fieldRules).toMatch(/\bProfileValidator\b/);
    expect(fieldRules).toMatch(/\bSecurityValidator\b/);
    expect(fieldRules).toMatch(/\bTagValidator\b/);
    expect(fieldRules).not.toMatch(
      /\b(?:validateRequiredMetadata|validateMetaField|validateProvenanceChain|logger)\b/,
    );
  });
});
