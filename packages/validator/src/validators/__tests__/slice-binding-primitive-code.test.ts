import { describe, expect, it } from 'vitest';
import { matchDiscriminator } from '../slice-discriminator-matcher';
import { codingMatchesBindingCodes, matchesPattern } from '../slice-utils';
import type { SliceDefinition } from '../slice-types';

// MHD ProvideDocumentBundle slices Bundle.entry with a value discriminator on
// request.method (a primitive `code`); slices like Folders/Patient carry no
// fixed/pattern there, only a required binding, which per the discriminator
// rules decides the match.
function provideBundleSlice(
  sliceName: string,
  bindingCodes: Set<string>,
): SliceDefinition {
  return {
    sliceName,
    path: 'Bundle.entry',
    min: 0,
    max: '*',
    discriminator: [{ type: 'value', path: 'request.method' }],
    childBindingValueSets: new Map([
      ['request.method', 'https://profiles.ihe.net/ITI/MHD/ValueSet/MHDprovideFolderActions'],
    ]),
    childBindingCodes: new Map([['request.method', bindingCodes]]),
  };
}

describe('value discriminator on primitive code via required binding', () => {
  const discriminator = { type: 'value', path: 'request.method' } as const;

  it('matches when the primitive code is in the binding expansion', () => {
    const slice = provideBundleSlice('Folders', new Set([
      'http://hl7.org/fhir/http-verb|POST', 'POST',
      'http://hl7.org/fhir/http-verb|PUT', 'PUT',
    ]));

    expect(matchDiscriminator(
      { resource: { resourceType: 'List' }, request: { method: 'POST', url: 'List' } },
      slice,
      discriminator,
      null,
      matchesPattern,
      codingMatchesBindingCodes,
    )).toBe(true);
  });

  it('does not match a primitive code outside the binding expansion', () => {
    const slice = provideBundleSlice('Folders', new Set([
      'http://hl7.org/fhir/http-verb|POST', 'POST',
      'http://hl7.org/fhir/http-verb|PUT', 'PUT',
    ]));

    expect(matchDiscriminator(
      { resource: { resourceType: 'List' }, request: { method: 'DELETE', url: 'List/1' } },
      slice,
      discriminator,
      null,
      matchesPattern,
      codingMatchesBindingCodes,
    )).toBe(false);
  });

  it('matches system-qualified expansion entries on their code part', () => {
    const slice = provideBundleSlice('Patient', new Set([
      'http://hl7.org/fhir/http-verb|PUT',
    ]));

    expect(matchDiscriminator(
      { resource: { resourceType: 'Patient' }, request: { method: 'PUT', url: 'Patient/1' } },
      slice,
      discriminator,
      null,
      matchesPattern,
      codingMatchesBindingCodes,
    )).toBe(true);
  });
});
