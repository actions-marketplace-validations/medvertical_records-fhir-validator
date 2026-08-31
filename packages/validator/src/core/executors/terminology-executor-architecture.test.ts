import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
  return readFileSync(
    resolve(process.cwd(), 'packages/validator/src/core/executors', file),
    'utf8',
  );
}

describe('terminology executor architecture', () => {
  it('keeps runtime rule and cache ownership behind the validation pipeline', () => {
    const executor = readSource('terminology-executor.ts');
    const pipeline = readSource('terminology-validation-pipeline.ts');

    expect(executor).toContain("from './terminology-validation-pipeline'");
    expect(executor).not.toMatch(
      /validateTerminologyElement|TerminologySlicePlanCache|CodeSystemReferenceLookupCache|UcumCodeValidator|expandContentReferenceElements/,
    );
    expect(pipeline).toContain('class TerminologyValidationPipeline');
    expect(pipeline).toContain('TerminologyElementPlanCache');
    expect(pipeline).toContain('validateTerminologyElement');
    expect(pipeline).toContain('appendTerminologyFailure');
    expect(pipeline).toContain('createTerminologyGlobalRules');
    expect(pipeline).not.toContain("from '../../validators/valueset-validator'");
    expect(pipeline).not.toMatch(
      /ContentReferenceElementsCache|expandContentReferenceElements|getElementTypeCodes|UCUM_BEARING_TYPES|validateCodingHygiene|validateKnownLoincDisplays|validateDeepLocalCodings/,
    );
  });

  it('keeps terminology element selection behind the element plan cache', () => {
    const planner = readSource('terminology-element-plan-cache.ts');

    expect(planner).toContain('class TerminologyElementPlanCache');
    expect(planner).toContain('ContentReferenceElementsCache');
    expect(planner).toContain('expandContentReferenceElements');
    expect(planner).toContain('getElementTypeCodes');
    expect(planner).toContain('UCUM_BEARING_TYPES');
  });

  it('keeps global terminology rule assembly behind the global rule plan', () => {
    const plan = readSource('terminology-global-rule-plan.ts');

    expect(plan).toContain('createTerminologyGlobalRules');
    expect(plan).toContain('validateKnownLoincDisplays');
    expect(plan).toContain('validateCodingHygiene');
    expect(plan).toContain('validateDeepLocalCodings');
  });
});
