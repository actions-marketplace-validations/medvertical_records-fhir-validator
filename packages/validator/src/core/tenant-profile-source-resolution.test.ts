import { afterEach, describe, expect, it, vi } from 'vitest';
import { setProfileSource } from '../persistence';
import {
  isTenantScopedProfileRequest,
  resolveTenantProfileFromSource,
} from './tenant-profile-source-resolution';
import type { StructureDefinition } from './structure-definition-types';

describe('tenant profile source resolution', () => {
  afterEach(() => setProfileSource({}));

  it('only scopes non-core profiles when an organization is present', () => {
    const tenantUrl = 'https://example.test/fhir/StructureDefinition/TenantPatient|1.2.3';

    expect(isTenantScopedProfileRequest(tenantUrl, { organizationId: 17 })).toBe(true);
    expect(isTenantScopedProfileRequest(tenantUrl, { serverId: 23 })).toBe(false);
    expect(isTenantScopedProfileRequest(
      'http://hl7.org/fhir/StructureDefinition/Patient|4.0.1',
      { organizationId: 17 },
    )).toBe(false);
  });

  it('forwards a versioned canonical and accepts only the exact profile', async () => {
    const profileUrl = 'https://example.test/fhir/StructureDefinition/TenantPatient|1.2.3';
    const profile = {
      resourceType: 'StructureDefinition',
      url: 'https://example.test/fhir/StructureDefinition/TenantPatient',
      version: '1.2.3',
      type: 'Patient',
    } as StructureDefinition;
    const resolveProfile = vi.fn().mockResolvedValue(profile);
    setProfileSource({ resolveProfile });

    await expect(resolveTenantProfileFromSource(
      profileUrl,
      'R4',
      { serverId: 23 },
    )).resolves.toBeNull();
    expect(resolveProfile).not.toHaveBeenCalled();

    await expect(resolveTenantProfileFromSource(
      profileUrl,
      'R4',
      { organizationId: 17, serverId: 23 },
    )).resolves.toBe(profile);
    expect(resolveProfile).toHaveBeenCalledWith(
      profile.url,
      '1.2.3',
      undefined,
      { organizationId: 17, serverId: 23, fhirVersion: 'R4' },
    );

    resolveProfile.mockResolvedValueOnce({ ...profile, version: '2.0.0' });
    await expect(resolveTenantProfileFromSource(
      profileUrl,
      'R4',
      { organizationId: 17, serverId: 23 },
    )).resolves.toBeNull();
  });
});
