import { afterEach, describe, expect, it, vi } from 'vitest';
import { setProfileSource } from '../persistence';
import { detectPackageForProfile } from './package-profile-detector';

afterEach(() => {
  setProfileSource({});
});

describe('detectPackageForProfile generic discovery', () => {
  it('uses the configured mapper for profiles outside the known pattern catalog', async () => {
    const findPackageForProfile = vi.fn(async () => ({
      packageId: 'example.fhir.dynamic',
      confidenceScore: 0.94,
    }));
    setProfileSource({ findPackageForProfile });

    await expect(detectPackageForProfile(
      'https://profiles.example.test/fhir/StructureDefinition/DynamicPatient',
    )).resolves.toBe('example.fhir.dynamic');
    expect(findPackageForProfile).toHaveBeenCalledWith(
      'https://profiles.example.test/fhir/StructureDefinition/DynamicPatient',
    );
  });

  it('does not pass known matches through the generic mapper', async () => {
    const findPackageForProfile = vi.fn();
    setProfileSource({ findPackageForProfile });

    await expect(detectPackageForProfile(
      'https://fhir.de/StructureDefinition/Patient',
    )).resolves.toBe('de.basisprofil.r4');
    expect(findPackageForProfile).not.toHaveBeenCalled();
  });

  it('rejects unsafe package ids returned by the configured mapper', async () => {
    setProfileSource({
      findPackageForProfile: async () => ({ packageId: 'example.fhir.safe\nforged' }),
    });

    await expect(detectPackageForProfile(
      'https://profiles.example.test/fhir/StructureDefinition/Unknown',
    )).resolves.toBeNull();
  });

  it('does not pass malformed canonicals or credential-bearing URLs to the mapper', async () => {
    const findPackageForProfile = vi.fn();
    setProfileSource({ findPackageForProfile });

    await expect(detectPackageForProfile('not a canonical')).resolves.toBeNull();
    await expect(detectPackageForProfile(
      'https://user:secret@profiles.example.test/StructureDefinition/Patient',
    )).resolves.toBeNull();
    expect(findPackageForProfile).not.toHaveBeenCalled();
  });

  it('uses generic discovery for unknown MII modules instead of guessing Person', async () => {
    const findPackageForProfile = vi.fn(async () => ({
      packageId: 'de.medizininformatikinitiative.kerndatensatz.future',
    }));
    setProfileSource({ findPackageForProfile });
    const canonical = 'https://www.medizininformatik-initiative.de/fhir/ext/modul-future/StructureDefinition/Future';

    await expect(detectPackageForProfile(canonical))
      .resolves.toBe('de.medizininformatikinitiative.kerndatensatz.future');
    expect(findPackageForProfile).toHaveBeenCalledWith(canonical);
  });
});
