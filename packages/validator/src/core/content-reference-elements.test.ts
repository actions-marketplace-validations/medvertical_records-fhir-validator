import { describe, expect, it } from 'vitest';
import { expandContentReferenceElements } from './content-reference-elements';
import type { ElementDefinition } from './structure-definition-types';

describe('contentReference element expansion ownership', () => {
  it('does not reuse an expansion across independent calls', () => {
    const elements: ElementDefinition[] = [
      { id: 'Questionnaire.item', path: 'Questionnaire.item' },
      {
        id: 'Questionnaire.item.item',
        path: 'Questionnaire.item.item',
        contentReference: '#Questionnaire.item',
      },
    ];
    expect(expandContentReferenceElements(elements)).not.toContainEqual(expect.objectContaining({
      id: 'Questionnaire.item.item.linkId',
    }));

    elements.push({
      id: 'Questionnaire.item.linkId',
      path: 'Questionnaire.item.linkId',
    });

    expect(expandContentReferenceElements(elements)).toContainEqual(expect.objectContaining({
      id: 'Questionnaire.item.item.linkId',
      path: 'Questionnaire.item.item.linkId',
    }));
  });

  it('resolves the absolute contentReference form emitted by profile snapshots', () => {
    const elements: ElementDefinition[] = [
      { id: 'QuestionnaireResponse.item', path: 'QuestionnaireResponse.item' },
      { id: 'QuestionnaireResponse.item.linkId', path: 'QuestionnaireResponse.item.linkId' },
      {
        id: 'QuestionnaireResponse.item.item',
        path: 'QuestionnaireResponse.item.item',
        contentReference:
          'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse#QuestionnaireResponse.item',
      },
    ];

    expect(expandContentReferenceElements(elements)).toContainEqual(expect.objectContaining({
      id: 'QuestionnaireResponse.item.item.linkId',
      path: 'QuestionnaireResponse.item.item.linkId',
    }));
  });

  it('does not copy slice-scoped constraints to the recursion point', () => {
    const elements: ElementDefinition[] = [
      { id: 'Parameters.parameter', path: 'Parameters.parameter' },
      { id: 'Parameters.parameter.value[x]', path: 'Parameters.parameter.value[x]' },
      {
        id: 'Parameters.parameter:status.value[x]',
        path: 'Parameters.parameter.value[x]',
        binding: { strength: 'required', valueSet: 'http://hl7.org/fhir/ValueSet/subscription-status' },
      },
      {
        id: 'Parameters.parameter.part',
        path: 'Parameters.parameter.part',
        contentReference: 'http://hl7.org/fhir/StructureDefinition/Parameters#Parameters.parameter',
      },
      {
        id: 'Parameters.parameter:status.part',
        path: 'Parameters.parameter.part',
        contentReference: 'http://hl7.org/fhir/StructureDefinition/Parameters#Parameters.parameter',
      },
    ];

    const expanded = expandContentReferenceElements(elements);

    expect(expanded).toContainEqual(expect.objectContaining({
      id: 'Parameters.parameter.part.value[x]',
    }));
    expect(expanded).not.toContainEqual(expect.objectContaining({
      binding: expect.objectContaining({ strength: 'required' }),
      path: 'Parameters.parameter.part.value[x]',
    }));
    expect(expanded.filter(element => element.id?.startsWith('Parameters.parameter:status.part.'))).toEqual([]);
  });
});
