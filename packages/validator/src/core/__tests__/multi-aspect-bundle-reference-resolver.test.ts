import { describe, expect, it } from 'vitest';
import { createBundleReferenceResolver } from '../multi-aspect-bundle-reference-resolver';

describe('multi-aspect bundle reference resolver', () => {
  it('resolves exact fullUrl references before relative fallbacks', () => {
    const exactTarget = {
      resourceType: 'Patient',
      id: 'exact',
    };
    const relativeTarget = {
      resourceType: 'Patient',
      id: 'p1',
    };
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: 'https://server.example/fhir/Patient/p1',
          resource: exactTarget,
        },
        {
          fullUrl: 'https://other.example/fhir/Patient/p1',
          resource: relativeTarget,
        },
      ],
    };

    const resolver = createBundleReferenceResolver(bundle, bundle);

    expect(resolver?.('https://server.example/fhir/Patient/p1')).toBe(exactTarget);
  });

  it('resolves absolute server URLs to bundled resources by ResourceType/id', () => {
    const target = {
      resourceType: 'Condition',
      id: 'mii-exa-onko-colorectal-cancer-diagnosis',
      meta: {
        profile: [
          'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/StructureDefinition/mii-pr-onko-diagnose-primaertumor|2026.0.3',
        ],
      },
    };
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: 'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/Condition/mii-exa-onko-colorectal-cancer-diagnosis',
          resource: target,
        },
      ],
    };

    const resolver = createBundleReferenceResolver(bundle, bundle);

    expect(
      resolver?.('https://server.fire.ly/Condition/mii-exa-onko-colorectal-cancer-diagnosis'),
    ).toBe(target);
  });

  it('normalizes versioned absolute references to the bundled ResourceType/id key', () => {
    const target = {
      resourceType: 'Procedure',
      id: 'operation-1',
    };
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: 'https://example.org/fhir/Procedure/operation-1',
          resource: target,
        },
      ],
    };

    const resolver = createBundleReferenceResolver(bundle, bundle);

    expect(resolver?.('https://server.fire.ly/fhir/Procedure/operation-1/_history/3')).toBe(target);
  });

  it('keeps contained references scoped to the root resource', () => {
    const containedTarget = {
      resourceType: 'Observation',
      id: 'contained-1',
    };
    const bundleTarget = {
      resourceType: 'Observation',
      id: 'contained-1',
    };
    const rootResource = {
      resourceType: 'Patient',
      id: 'p1',
      contained: [containedTarget],
    };
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: 'https://example.org/fhir/Observation/contained-1',
          resource: bundleTarget,
        },
      ],
    };

    const resolver = createBundleReferenceResolver(bundle, rootResource);

    expect(resolver?.('#contained-1')).toBe(containedTarget);
  });
});
