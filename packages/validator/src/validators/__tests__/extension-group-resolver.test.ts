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

  it('resolves extension-only primitive sidecars without a primitive value', () => {
    const extension = {
      url: 'http://example.org/fhir/StructureDefinition/birth-date-ext',
    };
    const resource = {
      resourceType: 'Patient',
      _birthDate: { extension: [extension] },
    };

    expect(getExtensionGroupsByParent(
      resource,
      'Patient.birthDate.extension',
      getValueAtPath,
    )).toEqual([[extension]]);
  });

  it('keeps primitive choice extensions grouped by repeated parent', () => {
    const firstExtension = {
      url: 'http://example.org/fhir/StructureDefinition/first',
    };
    const secondExtension = {
      url: 'http://example.org/fhir/StructureDefinition/second',
    };
    const resource = {
      resourceType: 'Observation',
      component: [
        {
          valueSet: 'must-not-be-treated-as-value-choice',
          valueString: 'first',
          _valueString: { extension: [firstExtension] },
        },
        {
          _valueString: { extension: [secondExtension] },
        },
      ],
    };

    expect(getExtensionGroupsByParent(
      resource,
      'Observation.component.value[x].extension',
      getValueAtPath,
    )).toEqual([
      [firstExtension],
      [secondExtension],
    ]);
  });

  it('contains failures from a caller-provided path reader', () => {
    expect(getExtensionGroupsByParent(
      { resourceType: 'Patient' },
      'Patient.extension',
      () => {
        throw new Error('malformed path');
      },
    )).toEqual([]);
  });
});
