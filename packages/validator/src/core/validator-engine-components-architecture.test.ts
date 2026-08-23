import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), 'packages/validator/src/core', file), 'utf8');
}

describe('validator engine component architecture', () => {
  it('keeps the public component factory as a composition boundary', () => {
    const facade = readSource('validator-engine-components.ts');

    expect(facade).toMatch(/createValidatorCoreRuntime\(config\)/);
    expect(facade).toMatch(/createValidatorExecutionComponents\(coreRuntime\)/);
    expect(facade).toMatch(/createValidatorAdministrationComponents\(core, execution\)/);
    expect(facade).not.toMatch(/\bnew\s+[A-Z]/);
    expect(facade).not.toMatch(/from ['"]\.\.\/validators\//);
  });

  it('keeps internal component groups independent from the public facade', () => {
    const internals = [
      'validator-core-components.ts',
      'validator-execution-components.ts',
      'validator-administration-components.ts',
    ].map(readSource).join('\n');

    expect(internals).not.toMatch(/from ['"]\.\/validator-engine-components['"]/);
  });
});
