import { describe, expect, it } from 'vitest';
import { validateBundleReachability } from '../bundle-reachability';

describe('validateBundleReachability', () => {
  it('reports document entries that cannot be reached from the Composition', () => {
    const issues = validateBundleReachability({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'urn:uuid:composition',
          resource: {
            resourceType: 'Composition',
            id: 'composition',
            subject: { reference: 'urn:uuid:patient' },
          },
        },
        {
          fullUrl: 'urn:uuid:patient',
          resource: { resourceType: 'Patient', id: 'patient' },
        },
        {
          fullUrl: 'urn:uuid:observation',
          resource: { resourceType: 'Observation', id: 'observation' },
        },
      ],
    }, 'document');

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'bundle-entry-not-reachable',
        path: 'Bundle.entry[2]',
        severity: 'error',
      }),
    ]);
  });

  it('treats an absolute Attachment.url as a link to an in-bundle Binary', () => {
    // eu.imaging document bundles reference their Binary only via
    // DiagnosticReport.presentedForm[0].url — the HL7 validator counts that
    // as a link, so must we.
    const issues = validateBundleReachability({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'http://example.com/fhir/Composition/comp',
          resource: {
            resourceType: 'Composition',
            id: 'comp',
            section: [{ entry: [{ reference: 'DiagnosticReport/report' }] }],
          },
        },
        {
          fullUrl: 'http://example.com/fhir/DiagnosticReport/report',
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'report',
            presentedForm: [{ contentType: 'application/pdf', url: 'http://example.com/fhir/Binary/pdf' }],
          },
        },
        {
          fullUrl: 'http://example.com/fhir/Binary/pdf',
          resource: { resourceType: 'Binary', id: 'pdf', contentType: 'application/pdf' },
        },
      ],
    }, 'document');

    expect(issues).toEqual([]);
  });

  it('resolves a relative Attachment.url against the entry fullUrl base', () => {
    const issues = validateBundleReachability({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'http://example.com/fhir/Composition/comp',
          resource: {
            resourceType: 'Composition',
            id: 'comp',
            section: [{ entry: [{ reference: 'DiagnosticReport/report' }] }],
          },
        },
        {
          fullUrl: 'http://example.com/fhir/DiagnosticReport/report',
          resource: {
            resourceType: 'DiagnosticReport',
            id: 'report',
            presentedForm: [{ contentType: 'application/pdf', url: 'Binary/pdf' }],
          },
        },
        {
          fullUrl: 'http://example.com/fhir/Binary/pdf',
          resource: { resourceType: 'Binary', id: 'pdf', contentType: 'application/pdf' },
        },
      ],
    }, 'document');

    expect(issues).toEqual([]);
  });

  it('does not treat extension canonical urls as bundle links', () => {
    const issues = validateBundleReachability({
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: 'http://example.com/fhir/Composition/comp',
          resource: {
            resourceType: 'Composition',
            id: 'comp',
            extension: [{ url: 'http://example.com/fhir/Binary/orphan', valueBoolean: true }],
          },
        },
        {
          fullUrl: 'http://example.com/fhir/Binary/orphan',
          resource: { resourceType: 'Binary', id: 'orphan', contentType: 'application/pdf' },
        },
      ],
    }, 'document');

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'bundle-entry-not-reachable',
        path: 'Bundle.entry[1]',
      }),
    ]);
  });

  it('handles malformed entry values safely in strict-reference mode', () => {
    expect(() => validateBundleReachability({
      entry: [null, 42, { resource: 'invalid' }],
    }, 'message', true)).not.toThrow();
  });

  it('ignores non-object bundle inputs', () => {
    expect(validateBundleReachability(null, 'document')).toEqual([]);
  });
});
