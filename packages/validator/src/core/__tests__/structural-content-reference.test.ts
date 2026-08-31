import { describe, expect, it } from 'vitest';
import { StructuralExecutor } from '../executors/structural-executor';
import type { StructureDefinition, ElementDefinition } from '../structure-definition-types';
import type { StructureDefinitionLoader } from '../structure-definition-loader';
import { getValueAtPath } from '../validation-utils';

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
      element('TestScript', 0, '*'),
      element('TestScript.name', 0, '1', 'string'),
      element('TestScript.status', 0, '1', 'code'),
      element('TestScript.setup', 0, '1'),
      element('TestScript.setup.action', 0, '*'),
      element('TestScript.setup.action.operation', 0, '1'),
      element('TestScript.setup.action.operation.type', 0, '1'),
      element('TestScript.setup.action.operation.encodeRequestUrl', 1, '1', 'boolean'),
      element('TestScript.setup.action.assert', 0, '1'),
      element('TestScript.setup.action.assert.stopTestOnFail', 1, '1', 'boolean'),
      element('TestScript.setup.action.assert.warningOnly', 1, '1', 'boolean'),
      element('TestScript.test', 0, '*'),
      element('TestScript.test.action', 1, '*'),
      contentReferenceElement('TestScript.test.action.operation', 0, '1', '#TestScript.setup.action.operation'),
      contentReferenceElement('TestScript.test.action.assert', 0, '1', '#TestScript.setup.action.assert'),
      element('TestScript.teardown', 0, '1'),
      element('TestScript.teardown.action', 0, '*'),
      contentReferenceElement('TestScript.teardown.action.operation', 1, '1', '#TestScript.setup.action.operation'),
    ],
  },
};

function element(path: string, min: number, max: string, type?: string): ElementDefinition {
  return {
    id: path,
    path,
    min,
    max,
    ...(type ? { type: [{ code: type }] } : {}),
  };
}

function contentReferenceElement(path: string, min: number, max: string, contentReference: string): ElementDefinition {
  return {
    id: path,
    path,
    min,
    max,
    contentReference,
  };
}

const mockSdLoader = {
  loadProfile: async () => testScriptStructureDefinition,
  getBaseResourceType: () => undefined,
} as unknown as StructureDefinitionLoader;

describe('StructuralExecutor contentReference support', () => {
  it('validates required children under concrete contentReference paths', async () => {
    const executor = new StructuralExecutor(mockSdLoader);
    const resource = {
      resourceType: 'TestScript',
      name: 'BasicTestScriptExample',
      status: 'active',
      setup: {
        action: [{
          operation: {
            type: { code: 'create' },
          },
        }],
      },
      test: [{
        action: [
          {
            operation: {
              type: { code: 'read' },
            },
          },
          {
            assert: {
              operator: 'equals',
            },
          },
        ],
      }],
      teardown: {
        action: [{
          operation: {
            type: { code: 'delete' },
          },
        }],
      },
    };

    const issues = await executor.validate(resource, {
      resource,
      resourceType: 'TestScript',
      structureDef: testScriptStructureDefinition,
      fhirVersion: 'R5',
      getValueAtPath,
    });

    const missingPaths = issues
      .filter(issue => issue.code === 'structural-cardinality-min' || issue.code === 'structural-required-element-missing')
      .map(issue => issue.path);

    expect(missingPaths).toEqual(expect.arrayContaining([
      'TestScript.setup.action[0].operation.encodeRequestUrl',
      'TestScript.test[0].action[0].operation.encodeRequestUrl',
      'TestScript.test[0].action[1].assert.stopTestOnFail',
      'TestScript.test[0].action[1].assert.warningOnly',
      'TestScript.teardown.action[0].operation.encodeRequestUrl',
    ]));
  });
});
