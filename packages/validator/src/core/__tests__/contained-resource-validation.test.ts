import { beforeAll, describe, expect, it } from 'vitest';
import { RecordsValidator } from '../validator-engine';

describe('contained resource validation', () => {
  let validator: RecordsValidator;

  const documentReference = {
    resourceType: 'DocumentReference',
    id: 'contained-validation-test',
    status: 'current',
    type: {
      coding: [{
        system: 'http://loinc.org',
        code: '55107-7',
      }],
    },
    subject: { reference: 'Patient/example' },
    date: '2026-07-22T12:00:00Z',
    author: [{ reference: '#author-role' }],
    content: [{
      attachment: {
        contentType: 'text/plain',
        data: 'dGVzdA==',
      },
    }],
    contained: [{
      resourceType: 'PractitionerRole',
      id: 'author-role',
      practitioner: { reference: '#author' },
    }, {
      resourceType: 'Practitioner',
      id: 'author',
      identifier: [{
        system: 'urn:oid:1',
        value: 'invalid-short-oid',
      }],
    }],
  };

  beforeAll(async () => {
    validator = new RecordsValidator({
      autoDownload: false,
      enableCaching: true,
      strictMode: false,
    });
    await validator.waitForInitialization();
  }, 120_000);

  it('runs full validation and rebases contained issue paths to the parent resource', async () => {
    const issues = await validator.validate(
      documentReference,
      'http://hl7.org/fhir/StructureDefinition/DocumentReference',
      'R4',
    );

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'structural-invalid-uri',
        path: 'DocumentReference.contained[1].identifier[0].system',
        resourceType: 'DocumentReference',
      }),
    ]));
    expect(issues.some(issue =>
      issue.code === 'missing-meta'
      && issue.path?.startsWith('DocumentReference.contained[0]')
    )).toBe(false);
    expect(issues.some(issue =>
      issue.path?.startsWith('DocumentReference.contained[0].practitioner')
      && (issue.code === 'reference-contained-unresolved' || issue.code === 'reference-ref1-invariant')
    )).toBe(false);
  }, 120_000);

  it('runs the same contained validation in the multi-aspect batch path', async () => {
    const resultMap = await validator.validateBatch([documentReference], {
      fhirVersion: 'R4',
      profileUrl: 'http://hl7.org/fhir/StructureDefinition/DocumentReference',
      maxConcurrency: 1,
      aspects: ['structural', 'profile', 'reference', 'metadata'],
      settings: { validationStrictness: 'standard', aspects: {} },
    });
    const result = resultMap.get(documentReference) as {
      aspects: Array<{ aspect: string; issues: Array<{ code?: string; path?: string; resourceType?: string }> }>;
    };
    const issues = result.aspects.flatMap(aspect => aspect.issues);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'structural-invalid-uri',
        path: 'DocumentReference.contained[1].identifier[0].system',
        resourceType: 'DocumentReference',
      }),
    ]));
    expect(issues.some(issue =>
      issue.path?.startsWith('DocumentReference.contained[0]')
      && issue.code?.includes('metadata')
    )).toBe(false);
    expect(issues.some(issue =>
      issue.path?.startsWith('DocumentReference.contained[0].practitioner')
      && (issue.code === 'reference-contained-unresolved' || issue.code === 'reference-ref1-invariant')
    )).toBe(false);
  }, 120_000);

  it('keeps missing-id and unreferenced diagnostics for an anonymous contained resource', async () => {
    const resource = {
      resourceType: 'Patient',
      id: 'anonymous-contained-test',
      contained: [{ resourceType: 'Patient', active: true }],
    };

    const issues = await validator.validate(
      resource,
      'http://hl7.org/fhir/StructureDefinition/Patient',
      'R4',
    );
    const errors = issues.filter(issue => issue.severity === 'error');

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'structural-contained-id-missing',
        path: 'Patient.contained[0]/*Patient/null*/',
      }),
      expect.objectContaining({
        code: 'structural-contained-not-referenced',
        path: 'Patient.contained[0]',
      }),
    ]));
  }, 120_000);
});
