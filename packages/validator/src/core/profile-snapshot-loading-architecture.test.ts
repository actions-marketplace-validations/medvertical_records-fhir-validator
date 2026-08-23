import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('profile snapshot loading architecture', () => {
  it('keeps collaborator classes out of the runtime dependency graph', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/validator/src/core/profile-snapshot-loading.ts'),
      'utf8',
    );

    expect(source).toContain("import type { ProfileCache } from '../cache/profile-cache'");
    expect(source).toContain("import type { SnapshotGenerator } from './snapshot-generator'");
    expect(source).toContain(
      "import type { StructureDefinitionLoader } from './structure-definition-loader'",
    );
  });
});
