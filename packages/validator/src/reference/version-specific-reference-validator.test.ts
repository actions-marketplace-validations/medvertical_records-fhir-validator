import { describe, expect, it, vi } from 'vitest';
import { VersionSpecificReferenceValidator } from './version-specific-reference-validator';

describe('VersionSpecificReferenceValidator boundaries', () => {
  const validator = new VersionSpecificReferenceValidator();

  it('rejects an empty pipe version', () => {
    expect(validator.validateVersionedReference(
      'https://example.org/fhir/StructureDefinition/example|',
    )).toMatchObject({
      isValid: false,
      severity: 'error',
    });
  });

  it('reads only string version metadata from HTTP responses', async () => {
    await expect(validator.checkVersionAvailability(
      'Patient/p1/_history/2',
      async () => ({ status: 200, data: { meta: { versionId: { value: '3' } } } }),
    )).resolves.toEqual({
      isAvailable: true,
      httpStatus: 200,
      actualVersion: undefined,
    });
  });

  it('extracts from cyclic and contained resources while skipping Expressions', () => {
    const resource: Record<string, unknown> = {
      subject: { reference: 'Patient/p1/_history/2' },
      expression: { language: 'text/cql', reference: 'Library/example|1' },
      contained: [{
        resourceType: 'Practitioner',
        id: 'pr1',
        organization: { reference: 'Organization/o1/_history/3' },
      }],
    };
    resource.self = resource;

    expect(validator.extractVersionedReferences(resource).map(item => item.reference))
      .toEqual(['Patient/p1/_history/2', 'Organization/o1/_history/3']);
  });

  it('does not parse partially numeric versions as integers for comparison', () => {
    expect(validator.compareVersions('12x', '2')).toBeLessThan(0);
    expect(validator.compareVersions('12', '2')).toBeGreaterThan(0);
  });

  it('preserves an absolute history URL when checking availability', async () => {
    const httpClient = vi.fn(async () => ({ status: 200 }));
    await validator.checkVersionAvailability(
      'https://example.org/fhir/Patient/p1/_history/2',
      httpClient,
    );
    expect(httpClient).toHaveBeenCalledWith('https://example.org/fhir/Patient/p1/_history/2');
  });

  it('preserves absolute and canonical bases when stripping versions', () => {
    expect(validator.stripVersion('https://example.org/fhir/Patient/p1/_history/2'))
      .toBe('https://example.org/fhir/Patient/p1');
    expect(validator.stripVersion('https://example.org/fhir/StructureDefinition/example|1.2'))
      .toBe('https://example.org/fhir/StructureDefinition/example');
  });

  it('compares numeric version ids without losing integer precision', () => {
    expect(validator.compareVersions('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
  });

  it('rejects canonical references with multiple version separators', () => {
    expect(validator.validateVersionedReference(
      'https://example.org/fhir/StructureDefinition/example|1|2',
    ).isValid).toBe(false);
  });

  it('ignores malformed Bundle entries', () => {
    expect(validator.validateBundleVersionIntegrity({
      resourceType: 'Bundle',
      entry: [null, 'invalid'],
    })).toMatchObject({
      isValid: true,
      issues: [],
    });
  });
});
