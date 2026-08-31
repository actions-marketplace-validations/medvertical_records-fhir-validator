import { describe, expect, it } from 'vitest';
import { detectKnownPackageForProfile } from './package-profile-patterns';

describe('detectKnownPackageForProfile', () => {
  it('matches known packages from canonical host and path boundaries', () => {
    expect(detectKnownPackageForProfile(
      'HTTPS://FHIR.KBV.DE/StructureDefinition/KBV_PR_EAU_Bundle|1.1.0',
    )).toEqual({
      packageId: 'kbv.ita.eau',
      pattern: 'KBV eAU',
    });
    expect(detectKnownPackageForProfile(
      'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips',
    )).toEqual({
      packageId: 'hl7.fhir.uv.ips',
      pattern: 'generic HL7 UV',
    });
  });

  it('does not trust known-looking text on an unrelated host', () => {
    expect(detectKnownPackageForProfile(
      'https://attacker.example/fhir.de/StructureDefinition/Patient',
    )).toBeNull();
    expect(detectKnownPackageForProfile(
      'https://attacker.example/hl7.org/fhir/us/core/StructureDefinition/Patient',
    )).toBeNull();
    expect(detectKnownPackageForProfile(
      'https://medizininformatik-initiative.de.attacker.example/fhir/core/Patient',
    )).toBeNull();
  });

  it('maps MII module and 2026 canonicals without falling back to a bundle', () => {
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/core/modul-labor/StructureDefinition/Laborbefund',
    )?.packageId).toBe('de.medizininformatikinitiative.kerndatensatz.laborbefund');
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/core/modul-person/StructureDefinition/Patient|2026.0.0',
    )?.packageId).toBe('de.medizininformatikinitiative.kerndatensatz.base');
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/ext/modul-onko/StructureDefinition/mii-pr-onko-diagnose-primaertumor|2026.0.3',
    )?.packageId).toBe('de.medizininformatikinitiative.kerndatensatz.onkologie');
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/ext/modul-pro/StructureDefinition/mii-pr-pro-questionnaire|2026.3.0',
    )?.packageId).toBe('de.medizininformatikinitiative.kerndatensatz.pros');
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/core/modul-fall/StructureDefinition/Fall|2025.0.1',
    )?.packageId).toBe('de.medizininformatikinitiative.kerndatensatz.fall');
  });

  it('maps ISiP canonicals to the package that is actually published', () => {
    expect(detectKnownPackageForProfile(
      'https://gematik.de/fhir/isip/v1/Basismodul/StructureDefinition/ISiPPflegeempfaenger',
    )?.packageId).toBe('de.gematik.isip');
  });

  it('maps ConsentManagement before the generic fhir.de basis profile', () => {
    expect(detectKnownPackageForProfile(
      'http://fhir.de/ConsentManagement/StructureDefinition/Patient',
    )).toEqual({
      packageId: 'de.einwilligungsmanagement',
      pattern: 'German Consent Management',
    });
  });

  it('does not guess the Person package for unknown MII extension modules', () => {
    expect(detectKnownPackageForProfile(
      'https://www.medizininformatik-initiative.de/fhir/ext/modul-unknown/StructureDefinition/Unknown',
    )).toBeNull();
  });

  it('ignores malformed and non-http profile references', () => {
    expect(detectKnownPackageForProfile('not a canonical')).toBeNull();
    expect(detectKnownPackageForProfile('file:///fhir.de/StructureDefinition/Patient')).toBeNull();
    expect(detectKnownPackageForProfile(
      'https://user:secret@fhir.de/StructureDefinition/Patient',
    )).toBeNull();
    expect(detectKnownPackageForProfile(
      'https://fhir.de:8443/StructureDefinition/Patient',
    )).toBeNull();
    expect(detectKnownPackageForProfile(
      'https://fhir.de/StructureDefinition/Patient|1.0.0|forged',
    )).toBeNull();
  });
});
