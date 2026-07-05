import { describe, expect, it } from 'vitest';

import { getValueAtPath } from '../../core/validation-utils';
import { getExtensionGroupsByParent } from '../extension-group-resolver';

describe('getExtensionGroupsByParent', () => {
  it('uses complex repeating parent extensions instead of primitive sidecars', () => {
    const resource = {
      resourceType: 'Specimen',
      processing: [
        {
          extension: [
            { url: 'http://example.org/fhir/StructureDefinition/processing-ext' },
          ],
        },
      ],
    };

    const groups = getExtensionGroupsByParent(
      resource,
      'Specimen.processing.extension',
      getValueAtPath,
    );

    expect(groups).toEqual([
      [{ url: 'http://example.org/fhir/StructureDefinition/processing-ext' }],
    ]);
  });

  it('still resolves primitive array sidecar extensions', () => {
    const resource = {
      resourceType: 'Patient',
      name: [
        {
          given: ['Ada'],
          _given: [
            {
              extension: [
                { url: 'http://example.org/fhir/StructureDefinition/given-ext' },
              ],
            },
          ],
        },
      ],
    };

    const groups = getExtensionGroupsByParent(
      resource,
      'Patient.name.given.extension',
      getValueAtPath,
    );

    expect(groups).toEqual([
      [{ url: 'http://example.org/fhir/StructureDefinition/given-ext' }],
    ]);
  });
});
