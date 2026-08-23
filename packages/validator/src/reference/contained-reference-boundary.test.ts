import { describe, expect, it } from 'vitest';
import { ContainedReferenceResolver } from './contained-reference-resolver';
import { validateContainedReferenceIssues } from './reference-contained-validation';

describe('ContainedReferenceResolver boundaries', () => {
  it('keeps only contained resources with string identity fields', () => {
    const resources = new ContainedReferenceResolver().extractContainedResources({
      contained: [
        null,
        'invalid',
        { id: 7, resourceType: 'Patient' },
        { id: 'p1', resourceType: 'Patient' },
      ],
    });

    expect(resources).toEqual([{
      id: 'p1',
      resourceType: 'Patient',
      resource: { id: 'p1', resourceType: 'Patient' },
    }]);
  });

  it('finds contained references in cyclic resources without overflowing', () => {
    const resource: Record<string, unknown> = {
      subject: { reference: '#p1' },
      contained: [{ resourceType: 'Patient', id: 'p1' }],
    };
    resource.self = resource;

    expect(new ContainedReferenceResolver().findContainedReferences(resource))
      .toEqual(['#p1']);
  });

  it('reports unresolved references while ignoring malformed contained entries', () => {
    const issues = validateContainedReferenceIssues({
      resourceType: 'Observation',
      contained: [null, { id: 9 }],
      subject: { reference: '#missing' },
    });

    expect(issues.map(issue => issue.code)).toEqual([
      'reference-contained-unresolved',
      'reference-ref1-invariant',
    ]);
  });
});
