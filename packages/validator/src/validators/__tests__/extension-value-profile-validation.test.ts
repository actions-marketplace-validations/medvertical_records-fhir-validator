import { describe, expect, it } from 'vitest';

import type { StructureDefinition } from '../../core/structure-definition-types';
import type { ElementRulesValidator } from '../element-rules-validator';
import type { ExtensionValidationContext } from '../extension-types';
import type { TypeValidator } from '../type-validator';
import type { ValueSetValidator } from '../valueset-validator';
import { validateExtensionValueElements } from '../extension-value-profile-validation';

const profileUrl = 'http://hl7.org/fhir/StructureDefinition/cqf-fhirQueryPattern';

const context: ExtensionValidationContext = {
  resource: { resourceType: 'Library' },
  profileSD: { resourceType: 'StructureDefinition' } as StructureDefinition,
  strictMode: false,
  fhirVersion: 'R4',
  profileUrl,
  getValueAtPath: () => undefined,
};

const typeValidator = { validate: async () => [] } as unknown as TypeValidator;
const valueSetValidator = { validateBinding: async () => [] } as unknown as ValueSetValidator;
const elementRulesValidator = { validate: () => [] } as unknown as ElementRulesValidator;

const requiredValueElements = [
  { id: 'Extension.value[x]', path: 'Extension.value[x]', min: 1, max: '1', type: [{ code: 'string' }] },
];

async function run(extension: Record<string, unknown>) {
  return validateExtensionValueElements({
    extension,
    valueElements: requiredValueElements,
    path: 'Library.dataRequirement.extension',
    profileUrl,
    context,
    typeValidator,
    valueSetValidator,
    elementRulesValidator,
  });
}

describe('validateExtensionValueElements', () => {
  it('reports a required value[x] that is absent entirely', async () => {
    const issues = await run({ url: profileUrl });
    expect(issues.map(issue => issue.code)).toContain('profile-extension-missing-value');
  });

  it('accepts a value[x] present only through its underscore sidecar', async () => {
    const issues = await run({
      url: profileUrl,
      _valueString: {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/cqf-expression',
          valueExpression: { language: 'text/cql-expression', expression: "'Patient?_id=' + %patientId" },
        }],
      },
    });
    expect(issues).toEqual([]);
  });

  it('still reports when the sidecar carries no id or extension', async () => {
    const issues = await run({ url: profileUrl, _valueString: {} });
    expect(issues.map(issue => issue.code)).toContain('profile-extension-missing-value');
  });
});
