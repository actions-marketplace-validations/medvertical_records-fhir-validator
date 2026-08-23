import { describe, expect, it } from 'vitest';
import {
  declaredProfileAncestryContains,
  prepareDeclaredProfileAncestry,
} from '../slice-profile-ancestry';
import { matchDiscriminator } from '../slice-discriminator-matcher';
import { codingMatchesBindingCodes, matchesPattern } from '../slice-utils';
import type { SliceDefinition } from '../slice-types';
import type { SlicingDefinition } from '../../core/structure-definition-types';

const MINIMAL_FOLDER = 'https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.Minimal.Folder';
const COMPREHENSIVE_FOLDER = 'https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.Comprehensive.Folder';
const MHD_LIST = 'https://profiles.ihe.net/ITI/MHD/StructureDefinition/IHE.MHD.List';

const baseByUrl: Record<string, string> = {
  [COMPREHENSIVE_FOLDER]: MINIMAL_FOLDER,
  [MINIMAL_FOLDER]: MHD_LIST,
  [MHD_LIST]: 'http://hl7.org/fhir/StructureDefinition/List',
};

const resolveProfile = async (url: string) => {
  const baseDefinition = baseByUrl[url];
  return baseDefinition ? { baseDefinition } : null;
};

const slicing: SlicingDefinition = {
  discriminator: [
    { type: 'profile', path: 'resource' },
    { type: 'value', path: 'request.method' },
  ],
  rules: 'closed',
};

// MHD Comprehensive.ProvideBundle requires Minimal.Folder on the Folders
// slice while its examples declare the derived Comprehensive.Folder; a
// derived profile conforms to its base, so the slice must match.
const foldersSlice: SliceDefinition = {
  sliceName: 'Folders',
  path: 'Bundle.entry',
  min: 0,
  max: '*',
  discriminator: slicing.discriminator,
  childTypes: new Map([
    ['resource', [{ code: 'List', profile: [MINIMAL_FOLDER] }]],
  ]),
};

function folderEntry(profile: string): Record<string, unknown> {
  return {
    resource: {
      resourceType: 'List',
      meta: { profile: [profile] },
      status: 'current',
      mode: 'working',
    },
    request: { method: 'POST', url: 'List' },
  };
}

describe('prepareDeclaredProfileAncestry', () => {
  it('lets a declared derived profile match a slice requiring its base', async () => {
    const entry = folderEntry(COMPREHENSIVE_FOLDER);
    await prepareDeclaredProfileAncestry([entry], slicing, resolveProfile);

    expect(declaredProfileAncestryContains(entry.resource, [MINIMAL_FOLDER])).toBe(true);
    expect(matchDiscriminator(
      entry,
      foldersSlice,
      { type: 'profile', path: 'resource' },
      null,
      matchesPattern,
      codingMatchesBindingCodes,
      [foldersSlice],
    )).toBe(true);
  });

  it('does not match profiles outside the declared derivation chain', async () => {
    const entry = folderEntry('https://example.org/fhir/StructureDefinition/UnrelatedList');
    await prepareDeclaredProfileAncestry([entry], slicing, resolveProfile);

    expect(declaredProfileAncestryContains(entry.resource, [MINIMAL_FOLDER])).toBe(false);
    expect(matchDiscriminator(
      entry,
      foldersSlice,
      { type: 'profile', path: 'resource' },
      null,
      matchesPattern,
      codingMatchesBindingCodes,
      [foldersSlice],
    )).toBe(false);
  });

  it('leaves matching unchanged when no resolver is available', async () => {
    const entry = folderEntry(COMPREHENSIVE_FOLDER);
    await prepareDeclaredProfileAncestry([entry], slicing, null);

    expect(matchDiscriminator(
      entry,
      foldersSlice,
      { type: 'profile', path: 'resource' },
      null,
      matchesPattern,
      codingMatchesBindingCodes,
      [foldersSlice],
    )).toBe(false);
  });

  it('terminates on cyclic baseDefinition chains', async () => {
    const cyclicResolver = async (url: string) => (
      url.endsWith('A')
        ? { baseDefinition: url.slice(0, -1) + 'B' }
        : { baseDefinition: url.slice(0, -1) + 'A' }
    );
    const entry = folderEntry('https://example.org/fhir/StructureDefinition/CycleA');
    await prepareDeclaredProfileAncestry([entry], slicing, cyclicResolver);

    expect(declaredProfileAncestryContains(entry.resource, [MINIMAL_FOLDER])).toBe(false);
  });
});
