import { describe, expect, it, vi } from 'vitest';
import type { ElementDefinition } from '../../core/structure-definition-types';
import { ConstraintValidator } from '../constraint-validator';

const codeSystemRoot: ElementDefinition[] = [{
  path: 'CodeSystem',
  constraint: [{
    key: 'csd-1',
    severity: 'error',
    human: 'All codes defined in a code system must be unique',
    expression: 'concept.code.combine($this.descendants().concept.code).isDistinct()',
  }],
}];

describe('ConstraintValidator CodeSystem invariants', () => {
  it('validates a large csd-1 concept tree without invoking the generic FHIRPath evaluator', async () => {
    const genericEvaluator = vi.fn(() => {
      throw new Error('the generic evaluator must not run for csd-1');
    });
    const validator = new ConstraintValidator(undefined, genericEvaluator as never);
    const concept = Array.from({ length: 50_000 }, (_, index) => ({ code: `code-${index}` }));

    const issues = await validator.validate(
      { resourceType: 'CodeSystem', id: 'large', concept },
      codeSystemRoot,
      'http://hl7.org/fhir/StructureDefinition/CodeSystem',
    );

    expect(issues).toEqual([]);
    expect(genericEvaluator).not.toHaveBeenCalled();
  });

  it('reports a nested duplicate while keeping the generic evaluator bypassed', async () => {
    const genericEvaluator = vi.fn(() => {
      throw new Error('the generic evaluator must not run for csd-1');
    });
    const validator = new ConstraintValidator(undefined, genericEvaluator as never);

    const issues = await validator.validate(
      {
        resourceType: 'CodeSystem',
        id: 'duplicate',
        concept: [
          { code: 'same' },
          { code: 'parent', concept: [{ code: 'same' }] },
        ],
      },
      codeSystemRoot,
      'http://hl7.org/fhir/StructureDefinition/CodeSystem',
    );

    expect(issues).toContainEqual(expect.objectContaining({ ruleId: 'csd-1' }));
    expect(genericEvaluator).not.toHaveBeenCalled();
  });
});
