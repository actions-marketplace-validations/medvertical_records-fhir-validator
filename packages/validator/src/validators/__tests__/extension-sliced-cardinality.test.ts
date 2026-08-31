import { describe, expect, it } from 'vitest';
import {
  checkSliceScopedExtensionCardinality,
  getParentSliceAncestors,
} from '../extension-sliced-cardinality';
import type { ElementDefinition } from '../../core/structure-definition-types';
import type { ExtensionDefinition } from '../extension-types';

// Da Vinci PAS profile-task: paLineNumber is required (min 1) ONLY inside the
// AttachmentsNeeded slice of Task.input. Enforcing it per raw Task.input
// repeat produced a false positive on the PayerURL slice's repeat.
const PA_LINE_NUMBER = 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/extension-paLineNumber';

const elements: ElementDefinition[] = [
  {
    id: 'Task.input',
    path: 'Task.input',
    slicing: { discriminator: [{ type: 'value', path: 'type' }], rules: 'open' },
  },
  { id: 'Task.input:PayerURL', path: 'Task.input', sliceName: 'PayerURL' },
  {
    id: 'Task.input:PayerURL.type',
    path: 'Task.input.type',
    patternCodeableConcept: {
      coding: [{ system: 'http://hl7.org/fhir/us/davinci-pas/CodeSystem/PASTempCodes', code: 'payer-url' }],
    },
  } as ElementDefinition,
  { id: 'Task.input:AttachmentsNeeded', path: 'Task.input', sliceName: 'AttachmentsNeeded' },
  {
    id: 'Task.input:AttachmentsNeeded.type',
    path: 'Task.input.type',
    patternCodeableConcept: {
      coding: [{ system: 'http://hl7.org/fhir/us/davinci-pas/CodeSystem/PASTempCodes', code: 'attachments-needed' }],
    },
  } as ElementDefinition,
  {
    id: 'Task.input:AttachmentsNeeded.extension:paLineNumber',
    path: 'Task.input.extension',
    sliceName: 'paLineNumber',
    min: 1,
    max: '1',
    type: [{ code: 'Extension', profile: [PA_LINE_NUMBER] }],
  },
];

const paLineNumberDefinition: ExtensionDefinition = {
  url: PA_LINE_NUMBER,
  path: 'Task.input.extension',
  elementId: 'Task.input:AttachmentsNeeded.extension:paLineNumber',
  min: 1,
  max: '1',
  profileUrl: PA_LINE_NUMBER,
  sliceName: 'paLineNumber',
};

const payerUrlInput = {
  type: { coding: [{ system: 'http://hl7.org/fhir/us/davinci-pas/CodeSystem/PASTempCodes', code: 'payer-url' }] },
  valueUrl: 'https://example.org/pas',
};

function attachmentsInput(extensions: unknown[]): Record<string, unknown> {
  return {
    extension: extensions,
    type: { coding: [{ system: 'http://hl7.org/fhir/us/davinci-pas/CodeSystem/PASTempCodes', code: 'attachments-needed' }] },
    valueCodeableConcept: { coding: [{ system: 'http://loinc.org', code: '18842-5' }] },
  };
}

describe('getParentSliceAncestors', () => {
  it('finds the parent slice above the extension element', () => {
    const ancestors = getParentSliceAncestors(paLineNumberDefinition, elements);
    expect(ancestors.map(ancestor => ancestor.id)).toEqual(['Task.input:AttachmentsNeeded']);
  });

  it('returns no ancestors for a top-level extension slice', () => {
    const definition: ExtensionDefinition = {
      url: 'http://example.org/fhir/StructureDefinition/plain',
      path: 'Patient.extension',
      elementId: 'Patient.extension:plain',
      min: 1,
      max: '1',
      sliceName: 'plain',
    };
    expect(getParentSliceAncestors(definition, elements)).toEqual([]);
  });
});

describe('checkSliceScopedExtensionCardinality', () => {
  it('does not require the extension on repeats outside the parent slice', () => {
    const resource = {
      resourceType: 'Task',
      input: [payerUrlInput, attachmentsInput([{ url: PA_LINE_NUMBER, valueInteger: 1 }])],
    };
    const issues = checkSliceScopedExtensionCardinality({
      elementPath: 'Task.input.extension',
      definitions: [[PA_LINE_NUMBER, paLineNumberDefinition]],
      elements,
      resource,
      profileUrl: 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-task',
    });
    expect(issues).toEqual([]);
  });

  it('still reports a matching repeat that misses the required extension', () => {
    const resource = {
      resourceType: 'Task',
      input: [payerUrlInput, attachmentsInput([])],
    };
    const issues = checkSliceScopedExtensionCardinality({
      elementPath: 'Task.input.extension',
      definitions: [[PA_LINE_NUMBER, paLineNumberDefinition]],
      elements,
      resource,
      profileUrl: 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-task',
    });
    expect(issues.map(issue => issue.code)).toEqual(['profile-extension-min-cardinality']);
  });
});
