import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core', file),
    'utf8',
  );
}

describe('RecordsValidator runtime-controls architecture', () => {
  it('keeps operational controls out of validation execution orchestration', () => {
    const engine = readSource('validator-engine.ts');
    const controls = readSource('validator-runtime-controls.ts');

    expect(engine).toMatch(/from ['"]\.\/validator-runtime-controls['"]/);
    expect(engine).not.toMatch(
      /new AnomalyDetector|from ['"]\.\.\/questionnaire-valueset-prewarm['"]|from ['"]\.\.\/validators\/fhirpath-cache-diagnostics['"]|from ['"]\.\/validator-runtime-settings['"]/,
    );

    expect(controls).toContain('class ValidatorRuntimeControls');
    expect(controls).toContain('applyProfileLoadingSettings');
    expect(controls).toContain('combineFHIRPathCacheStats');
    expect(controls).not.toMatch(/from ['"]\.\/validator-engine['"]/);
  });
});
