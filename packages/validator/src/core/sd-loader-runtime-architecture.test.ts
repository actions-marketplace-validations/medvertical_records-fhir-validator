import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('StructureDefinitionLoader runtime architecture', () => {
  it('keeps lifecycle state behind the public loader facade', () => {
    const facade = readSource('structure-definition-loader.ts');
    const runtime = readSource('sd-loader-runtime.ts');

    expect(facade).toMatch(/from ['"]\.\/sd-loader-runtime['"]/);
    expect(facade).not.toMatch(
      /new (?:AutoDownloadState|PackageProfileIndexCache|StructureDefinitionLoaderPolicyState)|initializeStructureDefinitionCache|invalidateProfilePolicyCaches/,
    );

    expect(runtime).toContain('class StructureDefinitionLoaderRuntime');
    expect(runtime).toContain('initializeStructureDefinitionCache');
    expect(runtime).toContain('invalidateProfilePolicyCaches');
    expect(runtime).toContain('private loadContext');
    expect(runtime).not.toMatch(/from ['"]\.\/structure-definition-loader['"]/);
  });
});
