import { describe, expect, it } from 'vitest';
import { CanonicalReferenceValidator } from './canonical-reference-validator';
import { getFieldValue } from './reference-utils';

const CANONICAL = 'https://example.org/fhir/StructureDefinition/example';

describe('CanonicalReferenceValidator boundaries', () => {
  it('rejects malformed canonical versions and URL credentials', () => {
    const validator = new CanonicalReferenceValidator();

    expect(validator.parseCanonicalUrl(`${CANONICAL}|1|2`).isValidFormat).toBe(false);
    expect(validator.parseCanonicalUrl(`${CANONICAL}|`).isValidFormat).toBe(false);
    expect(validator.parseCanonicalUrl('https://user:secret@example.org/fhir/ValueSet/x').isValidFormat)
      .toBe(false);
  });

  it('treats all non-star pattern characters literally', () => {
    const validator = new CanonicalReferenceValidator();

    expect(validator.matchesPattern(CANONICAL, 'https://example.org/*/example')).toBe(true);
    expect(validator.matchesPattern(CANONICAL, 'https://exampleXorg/*/example')).toBe(false);
    expect(validator.matchesPattern(CANONICAL, 'https://example.org/[fhir]/*')).toBe(false);
  });

  it('does not inspect fields on a non-object fetch response', async () => {
    const result = await new CanonicalReferenceValidator().resolveCanonical(
      CANONICAL,
      async () => 'opaque-result',
    );

    expect(result).toEqual({
      found: true,
      resource: 'opaque-result',
      source: 'remote',
    });
  });

  it('only compares string canonical metadata', async () => {
    const validator = new CanonicalReferenceValidator();

    const malformedMetadata = await validator.resolveCanonical(
      `${CANONICAL}|1`,
      async () => ({ url: 7, version: { value: '2' } }),
    );
    expect(malformedMetadata).toMatchObject({ found: true });
    expect(malformedMetadata).not.toHaveProperty('errorMessage');

    await expect(validator.resolveCanonical(
      CANONICAL,
      async () => ({ url: 'https://example.org/other' }),
    )).resolves.toMatchObject({
      found: true,
      errorMessage: expect.stringContaining('Canonical URL mismatch'),
    });
  });

  it('does not expose canonical fetch exception text', async () => {
    const result = await new CanonicalReferenceValidator().resolveCanonical(
      CANONICAL,
      async () => {
        throw new Error('https://user:secret@internal.example/private');
      },
    );

    expect(result).toMatchObject({
      found: false,
      errorMessage: 'Reference target request failed',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('skips malformed bundle entries and still validates nested resources', () => {
    const result = new CanonicalReferenceValidator().validateBundleCanonicals({
      entry: [
        null,
        'invalid',
        { resource: { profile: CANONICAL } },
      ],
    });

    expect(result.results).toHaveLength(1);
  });
});

describe('getFieldValue', () => {
  it('stops safely at scalar and array boundaries', () => {
    expect(getFieldValue({ subject: 'Patient/1' }, 'subject.reference')).toBeUndefined();
    expect(getFieldValue({ subject: [{ reference: 'Patient/1' }] }, 'subject.reference')).toBeUndefined();
    expect(getFieldValue({ subject: { reference: 'Patient/1' } }, 'subject.reference'))
      .toBe('Patient/1');
  });
});
