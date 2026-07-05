import { describe, expect, it } from 'vitest';
import type { ElementDefinition, StructureDefinition } from '../../structure-definition-types';
import { getValueAtPath } from '../../validation-utils';
import { TerminologyExecutor } from '../terminology-executor';

const MIME_TYPES = 'http://hl7.org/fhir/ValueSet/mimetypes|5.0.0';

function element(path: string, options: Partial<ElementDefinition> = {}): ElementDefinition {
  return {
    id: path,
    path,
    min: 0,
    max: '1',
    ...options,
  };
}

function requiredMimeCode(path: string): ElementDefinition {
  return element(path, {
    type: [{ code: 'code' }],
    binding: {
      strength: 'required',
      valueSet: MIME_TYPES,
    },
  });
}

const testScriptStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/TestScript',
  name: 'TestScript',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'TestScript',
  snapshot: {
    element: [
      element('TestScript'),
      element('TestScript.setup'),
      element('TestScript.setup.action', { max: '*' }),
      element('TestScript.setup.action.operation'),
      requiredMimeCode('TestScript.setup.action.operation.accept'),
      requiredMimeCode('TestScript.setup.action.operation.contentType'),
      element('TestScript.setup.action.assert'),
      requiredMimeCode('TestScript.setup.action.assert.contentType'),
      element('TestScript.test', { max: '*' }),
      element('TestScript.test.action', { min: 1, max: '*' }),
      element('TestScript.test.action.operation', {
        contentReference: '#TestScript.setup.action.operation',
      }),
      element('TestScript.test.action.assert', {
        contentReference: '#TestScript.setup.action.assert',
      }),
    ],
  },
};

describe('TerminologyExecutor contentReference bindings', () => {
  it('validates MIME required bindings on every indexed direct and contentReference path', async () => {
    const executor = new TerminologyExecutor();
    const issues = await executor.validate({
      resource: {
        resourceType: 'TestScript',
        setup: {
          action: [
            { operation: { accept: 'json' } },
            { assert: { contentType: 'application/fhir+json' } },
            { operation: { accept: 'json', contentType: 'json' } },
          ],
        },
        test: [{
          action: [
            { operation: { accept: 'json', contentType: 'none' } },
            { assert: { contentType: 'application/fhir+json' } },
            { assert: { contentType: 'json' } },
          ],
        }],
      },
      structureDef: testScriptStructureDefinition,
      getValueAtPath,
      fhirVersion: 'R5',
    });

    const mimeIssuePaths = issues
      .filter(issue => issue.code === 'terminology-binding-required-code')
      .map(issue => issue.path)
      .sort();

    expect(mimeIssuePaths).toEqual([
      'TestScript.setup.action[0].operation.accept',
      'TestScript.setup.action[2].operation.accept',
      'TestScript.setup.action[2].operation.contentType',
      'TestScript.test[0].action[0].operation.accept',
      'TestScript.test[0].action[0].operation.contentType',
      'TestScript.test[0].action[2].assert.contentType',
    ].sort());
  });
});
