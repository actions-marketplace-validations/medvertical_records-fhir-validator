import { describe, expect, it } from 'vitest';
import { StructuralExecutor } from '../executors/structural-executor';
import type { StructureDefinition, ElementDefinition } from '../structure-definition-types';
import type { StructureDefinitionLoader } from '../structure-definition-loader';
import { getValueAtPath } from '../validation-utils';

// IG-publisher profile snapshots reference recursive content with the
// absolute form "<sd-url>#Type.path" (the base spec uses local "#Type.path").
// The expansion must resolve both, or nested content loses its element types
// and primitive lints silently stop firing under declared profiles.
const CONTENT_REF =
  'http://hl7.org/fhir/StructureDefinition/QuestionnaireResponse#QuestionnaireResponse.item';

const sdcLikeProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://example.org/fhir/StructureDefinition/sdc-like-questionnaireresponse',
  name: 'SdcLikeQuestionnaireResponse',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'QuestionnaireResponse',
  derivation: 'constraint',
  snapshot: {
    element: [
      element('QuestionnaireResponse', 0, '*'),
      element('QuestionnaireResponse.status', 1, '1', 'code'),
      element('QuestionnaireResponse.item', 0, '*', 'BackboneElement'),
      element('QuestionnaireResponse.item.linkId', 1, '1', 'string'),
      element('QuestionnaireResponse.item.text', 0, '1', 'string'),
      element('QuestionnaireResponse.item.answer', 0, '*', 'BackboneElement'),
      choiceElement('QuestionnaireResponse.item.answer.value[x]', ['boolean', 'decimal', 'string', 'Quantity']),
      contentReferenceElement('QuestionnaireResponse.item.answer.item'),
      contentReferenceElement('QuestionnaireResponse.item.item'),
    ],
  },
};

function element(path: string, min: number, max: string, type?: string): ElementDefinition {
  return { id: path, path, min, max, ...(type ? { type: [{ code: type }] } : {}) };
}

function choiceElement(path: string, types: string[]): ElementDefinition {
  return { id: path, path, min: 0, max: '1', type: types.map(code => ({ code })) };
}

function contentReferenceElement(path: string): ElementDefinition {
  return { id: path, path, min: 0, max: '*', contentReference: CONTENT_REF };
}

const mockSdLoader = {
  loadProfile: async () => sdcLikeProfile,
  getBaseResourceType: () => undefined,
} as unknown as StructureDefinitionLoader;

function questionnaireResponse(nestedAnswer: Record<string, unknown>) {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: [{
      linkId: 'group',
      item: [{
        linkId: 'nested',
        answer: [nestedAnswer],
      }],
    }],
  };
}

async function validateAgainstProfile(resource: Record<string, unknown>) {
  const executor = new StructuralExecutor(mockSdLoader);
  return executor.validate(resource, {
    resource,
    resourceType: 'QuestionnaireResponse',
    profileUrl: sdcLikeProfile.url,
    structureDef: sdcLikeProfile,
    fhirVersion: 'R4',
    getValueAtPath,
  });
}

describe('declared-profile walk with absolute contentReference form', () => {
  it('flags an extreme decimal in a nested item.item.answer', async () => {
    const resource = questionnaireResponse({ valueDecimal: 1e300 });

    const issues = await validateAgainstProfile(resource);

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'decimal-value-out-of-range',
      path: 'QuestionnaireResponse.item[0].item[0].answer[0].valueDecimal',
    }));
  });

  it('flags whitespace padding on a nested item.item.answer string', async () => {
    const resource = questionnaireResponse({ valueString: ' padded answer ' });

    const issues = await validateAgainstProfile(resource);

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'string-whitespace-padding',
      path: 'QuestionnaireResponse.item[0].item[0].answer[0].valueString',
    }));
  });
});
