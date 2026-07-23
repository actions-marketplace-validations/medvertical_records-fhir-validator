import { describe, it, expect } from 'vitest';
import { QuestionnaireValidator } from '../questionnaire-validator';
import { valueSetCache } from '../valueset-cache';

const validator = new QuestionnaireValidator();

describe('QuestionnaireValidator — QuestionnaireResponse', () => {
  it('flags missing status as error', () => {
    const qr = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-1',
      questionnaire: 'http://example.org/Questionnaire/test',
      item: [{ linkId: 'q1', answer: [{ valueString: 'hello' }] }],
    };

    const issues = validator.validateQuestionnaireResponse(qr);
    const statusIssues = issues.filter(i => i.code === 'qr-missing-status');
    expect(statusIssues).toHaveLength(1);
    expect(statusIssues[0].severity).toBe('error');
  });

  it('flags missing linkId in response item', () => {
    const qr = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-2',
      status: 'completed',
      item: [{ answer: [{ valueString: 'hello' }] }],
    };

    const issues = validator.validateQuestionnaireResponse(qr);
    const linkIdIssues = issues.filter(i => i.code === 'qr-missing-linkid');
    expect(linkIdIssues).toHaveLength(1);
    expect(linkIdIssues[0].severity).toBe('error');
  });

  it('returns no issues for valid QuestionnaireResponse', () => {
    const qr = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-3',
      status: 'completed',
      questionnaire: 'http://example.org/Questionnaire/test',
      item: [{ linkId: 'q1', answer: [{ valueString: 'hello' }] }],
    };

    const issues = validator.validateQuestionnaireResponse(qr);
    expect(issues).toHaveLength(0);
  });

  it('can warn when a QuestionnaireResponse questionnaire reference is not resolved by the engine', () => {
    const qr = {
      resourceType: 'QuestionnaireResponse',
      id: 'qr-unresolved-questionnaire',
      status: 'completed',
      questionnaire: 'Questionnaire/5497895',
      item: [{ linkId: 'q1', answer: [{ valueString: 'hello' }] }],
    };

    const issues = validator.validateQuestionnaireResponse(qr, undefined, {
      warnOnUnresolvedQuestionnaireReference: true,
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'questionnaire-reference-not-resolved',
        path: 'QuestionnaireResponse.questionnaire',
        severity: 'warning',
      }),
    ]));
  });

  it('reports a canonical that resolves to the wrong conformance resource type', () => {
    const canonical = 'http://example.org/ValueSet/not-a-questionnaire';
    valueSetCache.setValueSetFile(canonical, {
      resourceType: 'ValueSet',
      url: canonical,
      status: 'active',
    });

    const issues = validator.validateQuestionnaireResponse({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: canonical,
    }, undefined, { warnOnUnresolvedQuestionnaireReference: true });
    valueSetCache.clear();

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'questionnaire-reference-wrong-type',
      severity: 'error',
      path: 'QuestionnaireResponse.questionnaire',
    }));
  });

  it('applies maxDecimalPlaces to decimal and quantity answers', () => {
    const questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [
        {
          linkId: 'decimal',
          type: 'decimal',
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces',
            valueInteger: 2,
          }],
        },
        {
          linkId: 'quantity',
          type: 'quantity',
          extension: [{
            url: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces',
            valueInteger: 2,
          }],
        },
      ],
    };
    const qr = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        { linkId: 'decimal', answer: [{ valueDecimal: 1.666 }] },
        { linkId: 'quantity', answer: [{ valueQuantity: { value: 1.666, unit: 'm' } }] },
      ],
    };

    const issues = validator.validateQuestionnaireResponse(qr, questionnaire);

    expect(issues.filter(i => i.code === 'questionnaire-sdc-maxdecimalplaces')).toHaveLength(2);
  });

  it('skips non-QuestionnaireResponse resources', () => {
    const patient = { resourceType: 'Patient', id: 'p1' };
    const issues = validator.validateQuestionnaireResponse(patient);
    expect(issues).toHaveLength(0);
  });
});

describe('QuestionnaireValidator — Questionnaire', () => {
  it('flags missing status as error', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-1',
      item: [{ linkId: 'q1', type: 'string' }],
    };

    const issues = validator.validateQuestionnaire(q);
    const statusIssues = issues.filter(i => i.code === 'questionnaire-missing-status');
    expect(statusIssues).toHaveLength(1);
    expect(statusIssues[0].severity).toBe('error');
  });

  it('flags duplicate linkIds', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-2',
      status: 'active',
      item: [
        { linkId: 'q1', type: 'string' },
        { linkId: 'q1', type: 'boolean' },
      ],
    };

    const issues = validator.validateQuestionnaire(q);
    const dupIssues = issues.filter(i => i.code === 'questionnaire-invariant-que-2');
    expect(dupIssues).toHaveLength(1);
  });

  it('uses the R5 que-1b warning for an empty group', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-r5-empty-group',
      status: 'active',
      item: [{ linkId: 'group', type: 'group' }],
    };

    const issues = validator.validateQuestionnaire(q, 'Questionnaire', 'R5');
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'constraint-violation-que-1b',
      severity: 'warning',
      path: 'Questionnaire.item[0]',
    }));
    expect(issues.some(issue => issue.code === 'questionnaire-invariant-que-1')).toBe(false);
  });

  it('returns no issues for valid Questionnaire', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-3',
      status: 'active',
      item: [
        { linkId: 'q1', type: 'string' },
        { linkId: 'q2', type: 'boolean' },
      ],
    };

    const issues = validator.validateQuestionnaire(q);
    expect(issues).toHaveLength(0);
  });

  it('allows answerOption on FHIR answer-capable Questionnaire item types', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-answer-options',
      status: 'active',
      item: [
        {
          linkId: 'coding-question',
          type: 'coding',
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA32971-6', display: 'Met' } },
          ],
        },
        {
          linkId: 'string-question',
          type: 'string',
          answerOption: [
            { valueString: 'Free text option' },
          ],
        },
      ],
    };

    const issues = validator.validateQuestionnaire(q);
    expect(issues.filter(i => i.code === 'questionnaire-invariant-que-5')).toHaveLength(0);
  });

  it('rejects answerOption on non-answer Questionnaire item types', () => {
    const q = {
      resourceType: 'Questionnaire',
      id: 'q-invalid-answer-options',
      status: 'active',
      item: [
        {
          linkId: 'display-with-options',
          type: 'display',
          answerOption: [
            { valueString: 'Invalid' },
          ],
        },
      ],
    };

    const issues = validator.validateQuestionnaire(q);
    expect(issues.filter(i => i.code === 'questionnaire-invariant-que-5')).toHaveLength(1);
  });
});
