import { describe, expect, it } from 'vitest';
import type { StructureDefinition } from '../../structure-definition-types';
import {
  findFunctionPathConstraint,
  hasFunctionPathSegments,
  resolveFunctionPathValue,
  splitFunctionPathSegments,
} from '../profile-nested-slice-function-paths';

const CARE_TEAM_SCOPE_URL =
  'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/extension-careTeamClaimScope';
const DISCRIMINATOR_PATH = `extension('${CARE_TEAM_SCOPE_URL}').value.ofType(boolean)`;

// PAS profile-claim shape: careTeam re-sliced by a boolean extension value,
// where the distinguishing fixed lives on the nested extension slice.
function buildPasCareTeamProfile(): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/profile-claim',
    name: 'PASClaim',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Claim',
    snapshot: {
      element: [
        {
          id: 'Claim.careTeam',
          path: 'Claim.careTeam',
          slicing: {
            discriminator: [{ type: 'value', path: DISCRIMINATOR_PATH }],
            rules: 'open',
          },
        },
        {
          id: 'Claim.careTeam:ItemClaimMember',
          path: 'Claim.careTeam',
          sliceName: 'ItemClaimMember',
        },
        {
          id: 'Claim.careTeam:ItemClaimMember.extension',
          path: 'Claim.careTeam.extension',
          slicing: { discriminator: [{ type: 'value', path: 'url' }], rules: 'open' },
        },
        {
          id: 'Claim.careTeam:ItemClaimMember.extension:careTeamClaimScope',
          path: 'Claim.careTeam.extension',
          sliceName: 'careTeamClaimScope',
          type: [{ code: 'Extension', profile: [CARE_TEAM_SCOPE_URL] }],
        },
        {
          id: 'Claim.careTeam:ItemClaimMember.extension:careTeamClaimScope.url',
          path: 'Claim.careTeam.extension.url',
          fixedUri: CARE_TEAM_SCOPE_URL,
        },
        {
          id: 'Claim.careTeam:ItemClaimMember.extension:careTeamClaimScope.value[x]',
          path: 'Claim.careTeam.extension.value[x]',
          fixedBoolean: false,
        },
      ],
    },
  };
}

describe('splitFunctionPathSegments', () => {
  it('keeps dotted URLs inside extension() as one segment', () => {
    expect(splitFunctionPathSegments(DISCRIMINATOR_PATH)).toEqual([
      `extension('${CARE_TEAM_SCOPE_URL}')`,
      'value',
      'ofType(boolean)',
    ]);
  });

  it('detects function segments only when parentheses are present', () => {
    expect(hasFunctionPathSegments(DISCRIMINATOR_PATH)).toBe(true);
    expect(hasFunctionPathSegments('code.coding.system')).toBe(false);
  });
});

describe('resolveFunctionPathValue', () => {
  const segments = splitFunctionPathSegments(DISCRIMINATOR_PATH);

  it('resolves the choice value of the URL-matched extension', () => {
    const careTeamEntry = {
      extension: [
        { url: 'http://example.org/other', valueBoolean: false },
        { url: CARE_TEAM_SCOPE_URL, valueBoolean: true },
      ],
      sequence: 1,
    };
    expect(resolveFunctionPathValue(careTeamEntry, segments)).toBe(true);
  });

  it('returns undefined when the discriminating extension is absent', () => {
    expect(resolveFunctionPathValue({ sequence: 1 }, segments)).toBeUndefined();
  });
});

describe('findFunctionPathConstraint', () => {
  it('locates the fixed value under the nested extension slice', () => {
    const profile = buildPasCareTeamProfile();
    const parentSlice = profile.snapshot!.element[1];
    const constraint = findFunctionPathConstraint(
      parentSlice,
      splitFunctionPathSegments(DISCRIMINATOR_PATH),
      profile,
    );
    expect(constraint?.id).toBe('Claim.careTeam:ItemClaimMember.extension:careTeamClaimScope.value[x]');
    expect(constraint?.fixedBoolean).toBe(false);
  });

  it('returns undefined when the extension URL does not match any slice', () => {
    const profile = buildPasCareTeamProfile();
    const parentSlice = profile.snapshot!.element[1];
    const constraint = findFunctionPathConstraint(
      parentSlice,
      splitFunctionPathSegments("extension('http://example.org/unrelated').value.ofType(boolean)"),
      profile,
    );
    expect(constraint).toBeUndefined();
  });
});
