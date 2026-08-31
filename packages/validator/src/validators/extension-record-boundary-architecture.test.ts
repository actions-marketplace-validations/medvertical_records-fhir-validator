import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionHelpers = [
  'extension-group-resolver.ts',
  'extension-instance-rule-validation.ts',
  'extension-instance-validation.ts',
  'extension-profile-scope-validation.ts',
  'extension-profile-validation.ts',
  'extension-universal-rules.ts',
  'extension-value-profile-validation.ts',
];

describe('extension record boundary architecture', () => {
  it.each(extensionHelpers)('reuses the canonical FHIR record guards in %s', (file) => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/validator/src/validators', file),
      'utf8',
    );

    expect(source).toContain("from '../core/fhir-resource'");
    expect(source).not.toMatch(/function (?:isRecord|resourceTypeOf)\s*\(/);
  });
});
