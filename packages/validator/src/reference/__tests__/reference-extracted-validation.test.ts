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
      code: 'invalid-reference-format',
      path: 'Bundle.entry[3].resource.subject.reference',
      resourceType: 'Bundle',
      details: {
        reference: 'Patient/',
        fieldPath: 'Bundle.entry[3].resource.subject',
      },
    });
  });
});
