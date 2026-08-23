import { describe, expect, it } from 'vitest';
import { validateExtractedReferences } from '../reference-extracted-validation';

const constraintValidator = {
  validateReferenceType: () => ({
    isValid: true,
    message: 'ok',
  }),
};

describe('validateExtractedReferences', () => {
  it('annotates invalid reference format issues with the extracted field path', () => {
    const issues = validateExtractedReferences(
      [{ path: 'Bundle.entry[3].resource.subject', reference: 'Patient/' }],
      'Bundle',
      constraintValidator,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'reference-invalid-format',
      path: 'Bundle.entry[3].resource.subject.reference',
      resourceType: 'Bundle',
      details: {
        reference: 'Patient/',
        fieldPath: 'Bundle.entry[3].resource.subject',
      },
    });
  });

  it('keeps deterministic IDs distinct for repeated values at different paths', () => {
    const issues = validateExtractedReferences(
      [
        { path: 'Observation.subject', reference: 'Patient/' },
        { path: 'Observation.performer[0]', reference: 'Patient/' },
      ],
      'Observation',
      constraintValidator,
    );

    expect(issues).toHaveLength(2);
    expect(issues[0].id).not.toBe(issues[1].id);
    expect(issues.map(issue => issue.path)).toEqual([
      'Observation.subject.reference',
      'Observation.performer[0].reference',
    ]);
  });
});
