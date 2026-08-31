import { describe, expect, it } from 'vitest';
import {
  extractReferencesFromBundle,
  extractReferencesFromResource,
} from './reference-extraction';
import { extractReferences } from './reference-format-validator';

describe('reference extraction boundaries', () => {
  it('handles cycles and includes references inside contained resources', () => {
    const resource: Record<string, unknown> = {
      subject: { reference: 'Patient/p1' },
      contained: [{
        resourceType: 'Practitioner',
        id: 'pr1',
        organization: { reference: 'Organization/o1' },
      }],
    };
    resource.self = resource;

    expect(extractReferencesFromResource(resource)).toEqual([
      'Patient/p1',
      'Organization/o1',
    ]);
  });

  it('does not treat FHIR Expression.reference as a resource reference', () => {
    expect(extractReferencesFromResource({
      expression: {
        language: 'text/cql',
        reference: 'Library/example|1',
      },
    })).toEqual([]);
  });

  it('normalizes malformed Bundle entries before extraction', () => {
    expect(extractReferencesFromBundle({
      resourceType: 'Bundle',
      entry: [
        null,
        { resource: { subject: { reference: 'Patient/p1' } } },
      ],
    })).toEqual(['Patient/p1']);
  });

  it('preserves the reference object path expected by format consumers', () => {
    expect(extractReferences({
      subject: { reference: 'Patient/p1' },
    }, 'Observation')).toEqual([{
      path: 'Observation.subject',
      reference: 'Patient/p1',
    }]);
  });
});
