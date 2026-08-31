import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/reference', file),
    'utf8',
  );
}

describe('batched reference checker architecture', () => {
  it('delegates input normalization and individual HTTP probes', () => {
    const checker = readSource('batched-reference-checker.ts');
    const input = readSource('reference-batch-input.ts');
    const probe = readSource('reference-probe-execution.ts');

    expect(checker).toContain('parseReferenceBatch');
    expect(checker).toContain('executeReferenceProbe');
    expect(checker).not.toMatch(
      /buildReferenceProbeUrl|extractUrlHost|classifyReferenceRequestFailure|extractReferencesFromResource|parseReference\(/,
    );

    expect(input).toContain('parseReference');
    expect(input).toContain('extractReferencesFromResource');
    expect(input).toContain('extractReferencesFromBundle');
    expect(input).not.toMatch(/AxiosInstance|ReferenceCircuitBreaker|ReferenceCheckCache/);

    expect(probe).toContain('buildReferenceProbeUrl');
    expect(probe).toContain('classifyReferenceRequestFailure');
    expect(probe).toContain('circuitBreaker.recordFailure');
    expect(probe).not.toMatch(/extractReferencesFromResource|summarizeReferenceBatch|logger/);
  });
});
