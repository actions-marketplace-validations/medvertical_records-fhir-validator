import { describe, expect, it } from 'vitest';

import { validateBundleNarrativeLinks } from '../bundle-narrative-links';

describe('Bundle narrativeLink validation', () => {
  it('reports missing and ambiguous cross-entry narrative fragments', () => {
    const compositionUrl = 'urn:uuid:composition';
    const bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        {
          fullUrl: compositionUrl,
          resource: {
            resourceType: 'Composition',
            text: {
              status: 'generated',
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><span id="duplicate">one</span></div>',
            },
            section: [{
              text: {
                status: 'generated',
                div: '<div xmlns="http://www.w3.org/1999/xhtml"><span id="duplicate">two</span></div>',
              },
            }],
          },
        },
        {
          fullUrl: 'urn:uuid:allergy-1',
          resource: {
            resourceType: 'AllergyIntolerance',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/narrativeLink', valueUri: `${compositionUrl}#missing` }],
          },
        },
        {
          fullUrl: 'urn:uuid:allergy-2',
          resource: {
            resourceType: 'AllergyIntolerance',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/narrativeLink', valueUrl: `${compositionUrl}#duplicate` }],
          },
        },
      ],
    };

    expect(validateBundleNarrativeLinks(bundle)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'bundle-narrative-link-target-not-found', path: 'Bundle' }),
      expect.objectContaining({
        code: 'bundle-narrative-link-target-ambiguous',
        path: 'Bundle',
        details: expect.objectContaining({ matchCount: 2 }),
      }),
    ]));
  });

  it('accepts a narrative fragment that occurs exactly once', () => {
    const compositionUrl = 'urn:uuid:composition';
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: compositionUrl,
          resource: {
            resourceType: 'Composition',
            text: { div: '<div xmlns="http://www.w3.org/1999/xhtml"><span id="only">one</span></div>' },
          },
        },
        {
          fullUrl: 'urn:uuid:allergy',
          resource: {
            resourceType: 'AllergyIntolerance',
            extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/narrativeLink', valueUrl: `${compositionUrl}#only` }],
          },
        },
      ],
    };

    expect(validateBundleNarrativeLinks(bundle)).toEqual([]);
  });
});
