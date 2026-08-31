import {
  FHIR_CORE_EXTENSION_PACKAGE_SET,
  FHIR_CORE_PACKAGE_SET,
  FHIR_CORE_TERMINOLOGY_PACKAGE_SET,
  HL7_EU_EHDS_2026_PACKAGE_SET,
  MII_2026_PACKAGE_SET,
  type FhirPackagePin,
} from './ig-packages';

export const BUNDLED_PROFILE_PRESETS = ['default', 'mii-2026', 'ehds-2026'] as const;

export type BundledProfilePreset = typeof BUNDLED_PROFILE_PRESETS[number];

const DEFAULT_BUNDLED_PROFILE_PACKAGE_SET: FhirPackagePin[] = [
  ...FHIR_CORE_PACKAGE_SET,
  ...FHIR_CORE_TERMINOLOGY_PACKAGE_SET,
  ...FHIR_CORE_EXTENSION_PACKAGE_SET,
  { id: 'fhir.r4.ukcore.stu3.currentbuild', version: '0.0.6-pre-release' },
  {
    id: 'de.medizininformatikinitiative.kerndatensatz.person',
    version: '2025.0.1',
  },
  { id: 'de.gematik.isik-basismodul', version: '4.0.3' },
];

export interface BundledProfilePlan {
  preset: BundledProfilePreset;
  packages: readonly FhirPackagePin[];
  ownedDependencyPrefixes: readonly string[];
  requiredDependencyIds: readonly string[];
}

export function parseBundledProfilePreset(
  value: string | undefined,
  fallback: BundledProfilePreset = 'default',
): BundledProfilePreset {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (isBundledProfilePreset(normalized)) return normalized;
  throw new Error(`Unsupported bundled profile preset: ${normalized}`);
}

export function getBundledProfilePlan(preset: BundledProfilePreset): BundledProfilePlan {
  const packages = new Map(
    DEFAULT_BUNDLED_PROFILE_PACKAGE_SET.map(pin => [pin.id, pin] as const),
  );
  if (preset !== 'default') {
    for (const pin of MII_2026_PACKAGE_SET) packages.set(pin.id, pin);
  }
  if (preset === 'ehds-2026') {
    for (const pin of HL7_EU_EHDS_2026_PACKAGE_SET) packages.set(pin.id, pin);
  }

  return {
    preset,
    packages: [...packages.values()],
    ownedDependencyPrefixes: preset === 'default'
      ? []
      : preset === 'mii-2026'
        ? ['de.medizininformatikinitiative.']
        : ['de.medizininformatikinitiative.', 'hl7.fhir.eu.', 'ihe.pharm.'],
    requiredDependencyIds: preset === 'default'
      ? []
      : ['de.einwilligungsmanagement'],
  };
}

export function isBundledProfilePreset(value: string): value is BundledProfilePreset {
  return (BUNDLED_PROFILE_PRESETS as readonly string[]).includes(value);
}
