import { describe, expect, it } from 'vitest';
import { validateExtensionInstanceRules } from '../extension-instance-rule-validation';
import type { ExtensionDefinition, ExtensionValidationContext } from '../extension-types';

const URL = 'http://example.org/StructureDefinition/test-extension';
const PATH = `Patient.extension[url='${URL}']`;

function createContext(strictMode: boolean): ExtensionValidationContext {
  const resource = { resourceType: 'Patient' };
  return {
    resource,
    profileSD: {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/test-patient',
      type: 'Patient',
    },
    strictMode,
    fhirVersion: 'R4',
    profileUrl: 'http://example.org/StructureDefinition/test-patient',
    getValueAtPath: () => undefined,
  };
}

async function validate(
  extension: Record<string, unknown>,
  definition: ExtensionDefinition | undefined,
  options: {
    extensionType?: 'extension' | 'modifierExtension';
    skipUniversalChecks?: boolean;
    strictMode?: boolean;
  } = {},
) {
  return validateExtensionInstanceRules({} as never, {
    context: createContext(options.strictMode ?? false),
    definition,
    extension,
    extensionPath: PATH,
    extensionType: options.extensionType ?? 'extension',
    skipUniversalChecks: options.skipUniversalChecks ?? false,
    url: URL,
  });
}

describe('extension instance rule validation', () => {
  it('keeps strict-profile diagnostics before universal structure diagnostics', async () => {
    const issues = await validate({ url: URL }, undefined, { strictMode: true });

    expect(issues.map(issue => issue.code)).toEqual([
      'profile-extension-not-in-profile',
      'profile-extension-no-value',
    ]);
  });

  it('skips universal checks during the profile-scoped second pass', async () => {
    const issues = await validate(
      { url: URL },
      undefined,
      { skipUniversalChecks: true, strictMode: true },
    );

    expect(issues.map(issue => issue.code)).toEqual([
      'profile-extension-not-in-profile',
    ]);
  });

  it('reports modifier and declared value-type mismatches in stable order', async () => {
    const issues = await validate(
      { url: URL, valueString: 'not a Coding' },
      {
        url: URL,
        path: 'Patient.modifierExtension',
        min: 0,
        max: '1',
        typeCodes: ['Coding'],
      },
      { extensionType: 'modifierExtension', skipUniversalChecks: true },
    );

    expect(issues.map(issue => issue.code)).toEqual([
      'profile-extension-modifier-mismatch',
      'profile-extension-invalid-value-type',
    ]);
  });
});
