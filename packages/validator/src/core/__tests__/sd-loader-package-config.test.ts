import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPackageAllowed, parseAllowedPackages } from '../sd-loader-package-config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SD loader package allowlist', () => {
  it('allows the HL7 SDC package by default', () => {
    vi.stubEnv('FHIR_ALLOWED_PACKAGES', '');

    const allowed = parseAllowedPackages();

    expect(allowed).toContain('hl7.fhir.uv.sdc');
    expect(isPackageAllowed('hl7.fhir.uv.sdc', allowed)).toBe(true);
  });

  it('allows the KBV EAU package by default', () => {
    vi.stubEnv('FHIR_ALLOWED_PACKAGES', '');

    const allowed = parseAllowedPackages();

    expect(allowed).toContain('kbv.ita.eau');
    expect(isPackageAllowed('kbv.ita.eau', allowed)).toBe(true);
  });

  it('allows the KBV FOR package by default', () => {
    vi.stubEnv('FHIR_ALLOWED_PACKAGES', '');

    const allowed = parseAllowedPackages();

    expect(allowed).toContain('kbv.ita.for');
    expect(isPackageAllowed('kbv.ita.for', allowed)).toBe(true);
  });

  it('still honors explicit package restrictions', () => {
    vi.stubEnv('FHIR_ALLOWED_PACKAGES', 'hl7.fhir.us.core');

    const allowed = parseAllowedPackages();

    expect(isPackageAllowed('hl7.fhir.us.core', allowed)).toBe(true);
    expect(isPackageAllowed('hl7.fhir.uv.sdc', allowed)).toBe(false);
  });
});
