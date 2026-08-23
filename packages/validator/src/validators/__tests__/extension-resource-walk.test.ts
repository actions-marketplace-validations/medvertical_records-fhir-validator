import { describe, expect, it, vi } from 'vitest';
import { walkResourceExtensions } from '../extension-resource-walk';

describe('walkResourceExtensions', () => {
  it('finds extensions beyond arbitrary object depth without confusing it with extension depth', async () => {
    const resource: Record<string, unknown> = { resourceType: 'Patient' };
    let current = resource;
    for (let depth = 0; depth < 40; depth++) {
      const child: Record<string, unknown> = {};
      current.child = child;
      current = child;
    }
    current.extension = [{
      url: 'https://acme.test/fhir/StructureDefinition/deep',
      valueString: 'found',
    }];
    const isExtensionUrlResolvable = vi.fn(async () => true);
    const visited = new Set<string>();

    await walkResourceExtensions(
      resource,
      'Patient',
      {
        resource,
        profileSD: { resourceType: 'StructureDefinition' },
        strictMode: false,
        fhirVersion: 'R4',
        profileUrl: 'https://acme.test/fhir/StructureDefinition/patient',
        getValueAtPath: () => undefined,
      },
      new Set(),
      visited,
      [],
      {
        maxNestedExtensionDepth: 5,
        isExtensionUrlResolvable,
        getDeclaredContexts: async () => null,
      },
    );

    expect(isExtensionUrlResolvable).toHaveBeenCalledWith(
      'https://acme.test/fhir/StructureDefinition/deep',
      'R4',
    );
    expect([...visited].some((path) => /\.extension\[0\]$/.test(path))).toBe(true);
  });

  it('terminates on cyclic resource graphs', async () => {
    const resource: Record<string, unknown> = { resourceType: 'Patient' };
    resource.self = resource;
    const visited = new Set<string>();
    await walkResourceExtensions(
      resource,
      'Patient',
      {
        resource,
        profileSD: { resourceType: 'StructureDefinition' },
        strictMode: false,
        fhirVersion: 'R4',
        profileUrl: 'test',
        getValueAtPath: () => undefined,
      },
      new Set(),
      visited,
      [],
      {
        maxNestedExtensionDepth: 5,
        isExtensionUrlResolvable: async () => true,
        getDeclaredContexts: async () => null,
      },
    );
    expect(visited.size).toBe(0);
  });
});
