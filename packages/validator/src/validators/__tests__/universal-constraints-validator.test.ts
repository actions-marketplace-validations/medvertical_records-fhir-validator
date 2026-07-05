import { describe, expect, it } from 'vitest';
import { universalConstraintsValidator } from '../universal-constraints-validator';

describe('universalConstraintsValidator', () => {
  it('does not report ele-1 when a primitive sidecar-only child has extensions', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'Observation',
      id: 'obs-heart-rate',
      subject: {
        _reference: {
          extension: [{
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue',
            valueString: "'Patient/' + %resource.item.where(linkId='patient-id').answer.valueString",
          }],
        },
      },
    });

    expect(issues.some(issue => issue.code === 'ele-1-violation')).toBe(false);
  });

  it('does not report ele-1 when a repeating primitive sidecar array has extensions', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'ActivityDefinition',
      id: 'administer-zika-virus-exposure-assessment',
      timingTiming: {
        _event: [{
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/cqf-expression',
            valueExpression: {
              language: 'text/cql',
              expression: 'Now()',
            },
          }],
        }],
      },
    });

    expect(issues.some(issue =>
      issue.code === 'ele-1-violation' &&
      issue.path === 'ActivityDefinition.timingTiming'
    )).toBe(false);
  });

  it('still reports ele-1 when a primitive sidecar-only child is empty', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'Observation',
      id: 'obs-heart-rate',
      subject: {
        _reference: {},
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'ele-1-violation',
      path: 'Observation.subject',
    }));
  });

  it('still reports ele-1 when a repeating primitive sidecar array has no meaningful items', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'ActivityDefinition',
      id: 'empty-timing',
      timingTiming: {
        _event: [{}],
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'ele-1-violation',
      path: 'ActivityDefinition.timingTiming',
    }));
  });

  it('accepts conditional relative references for ref-1', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'Encounter',
      id: 'enc-1',
      subject: {
        reference: 'Patient?identifier=9000951',
      },
    });

    expect(issues.some(issue => issue.code === 'ref-1-violation')).toBe(false);
  });

  it('still rejects bare non-url reference values for ref-1', () => {
    const issues = universalConstraintsValidator.validate({
      resourceType: 'Encounter',
      id: 'enc-1',
      subject: {
        reference: 'not-a-reference',
      },
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'ref-1-violation',
      path: 'Encounter.subject.reference',
    }));
  });
});
