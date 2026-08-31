import { describe, expect, it } from 'vitest';
import { validateCodingHygiene } from '../terminology-coding-hygiene-rules';

describe('validateCodingHygiene', () => {
  it('reports Coding.code values that violate FHIR code whitespace rules', () => {
    const issues = validateCodingHygiene({
      resourceType: 'Condition',
      code: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: ' 422650009',
          display: 'Social isolation (finding)',
        }],
      },
    }, []);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'terminology-code-invalid',
        path: 'Condition.code.coding[0].code',
        severity: 'error',
        details: expect.objectContaining({
          code: ' 422650009',
          reason: 'code-whitespace',
        }),
      }),
    ]));
  });

  it('allows single internal spaces permitted by the FHIR code primitive regex', () => {
    const issues = validateCodingHygiene({
      resourceType: 'Observation',
      code: {
        coding: [{
          system: 'http://example.org/codes',
          code: 'alpha beta',
        }],
      },
    }, []);

    expect(issues.filter(issue => issue.details?.reason === 'code-whitespace')).toHaveLength(0);
  });

  it('reports Coding.system values that contain raw whitespace', () => {
    const issues = validateCodingHygiene({
      resourceType: 'Device',
      type: [{
        coding: [{
          system: ' http://snomed.info/sct',
          code: '33894003',
          display: 'Experimental Device',
        }],
      }],
    }, []);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'terminology-code-invalid',
        path: 'Device.type[0].coding[0].system',
        severity: 'error',
        details: expect.objectContaining({
          code: '33894003',
          system: ' http://snomed.info/sct',
          reason: 'system-whitespace',
        }),
      }),
    ]));
  });

  it('terminates safely when an object graph contains a cycle', () => {
    const resource: Record<string, unknown> = { resourceType: 'Observation' };
    resource.self = resource;

    expect(validateCodingHygiene(resource, [])).toEqual([]);
  });
});
