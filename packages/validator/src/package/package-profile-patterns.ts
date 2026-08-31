import { isSafePackageId } from './package-artifact-policy.js';

export interface KnownPackageMatch {
  packageId: string;
  pattern: string;
}

interface ParsedProfileCanonical {
  hostname: string;
  path: string;
  version?: string;
}

interface PackagePattern {
  packageId: string;
  name: string;
  matches(canonical: ParsedProfileCanonical): boolean;
}

const STATIC_PACKAGE_PATTERNS: PackagePattern[] = [
  packagePattern('hl7.fhir.us.davinci-pdex-plan-net', 'Da Vinci PDEX Plan-Net', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/us/davinci-pdex-plan-net/')),
  packagePattern('hl7.fhir.us.davinci-pdex', 'Da Vinci PDEX', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/us/davinci-pdex/')),
  packagePattern('hl7.fhir.us.davinci-crd', 'Da Vinci CRD', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/us/davinci-crd/')),
  packagePattern('hl7.fhir.us.core', 'US Core', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/us/core/')),
  packagePattern('hl7.fhir.uv.sdc', 'HL7 SDC', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/uv/sdc/')),
  packagePattern('uk.core.r4.v2', 'UK Core', canonical =>
    isHost(canonical, 'fhir.hl7.org.uk') || isHost(canonical, 'fhir.uk')),
  packagePattern('nictiz.fhir.nl.r4.nl-core', 'Nictiz NL R4', canonical =>
    isHost(canonical, 'nictiz.nl') && hasPathPrefix(canonical, '/fhir/')),
  packagePattern('de.einwilligungsmanagement', 'German Consent Management', canonical =>
    isHost(canonical, 'fhir.de') && hasPathSegment(canonical, 'consentmanagement')),
  packagePattern('de.basisprofil.r4', 'German Basisprofile', canonical =>
    isHost(canonical, 'fhir.de')),
  packagePattern('de.gematik.isip', 'ISiP', canonical =>
    isHost(canonical, 'gematik.de') && hasPathSegment(canonical, 'isip')),
  packagePattern('de.gematik.isik-basismodul', 'ISiK', canonical =>
    isHost(canonical, 'gematik.de') && hasPathSegment(canonical, 'isik')),
  packagePattern('kbv.ita.eau', 'KBV eAU', canonical =>
    isHost(canonical, 'fhir.kbv.de') &&
    canonical.path.includes('/structuredefinition/kbv_') &&
    canonical.path.includes('_eau_')),
  packagePattern('kbv.ita.for', 'KBV FOR', canonical =>
    isHost(canonical, 'fhir.kbv.de') &&
    canonical.path.includes('/structuredefinition/kbv_') &&
    canonical.path.includes('_for_')),
  packagePattern('kbv.basis', 'KBV Basis', canonical =>
    isHost(canonical, 'fhir.kbv.de')),
  packagePattern('hl7.fhir.au.ereq', 'Australian eRequesting', canonical =>
    isHost(canonical, 'hl7.org.au') && hasPathPrefix(canonical, '/fhir/ereq/')),
  packagePattern('hl7.fhir.au.base', 'Australian Base', canonical =>
    isHost(canonical, 'hl7.org.au')),
  packagePattern('hl7.fhir.eu.eps', 'HL7 Europe EPS', canonical =>
    isHost(canonical, 'hl7.eu') && hasPathPrefix(canonical, '/fhir/eps/')),
  packagePattern('hl7.fhir.eu.base', 'HL7 Europe Base', canonical =>
    isHost(canonical, 'hl7.eu') && hasPathPrefix(canonical, '/fhir/base/')),
  packagePattern('hl7.fhir.ca.baseline', 'Canadian Baseline', canonical =>
    isHost(canonical, 'hl7.org') && hasPathPrefix(canonical, '/fhir/ca/')),
  packagePattern('who.fhir.anc-cds', 'WHO ANC-CDS', canonical =>
    isHost(canonical, 'fhir.org') && hasPathPrefix(canonical, '/guides/who/anc-cds/')),
];

export function detectKnownPackageForProfile(profileUrl: string): KnownPackageMatch | null {
  const canonical = parseProfileCanonical(profileUrl);
  if (!canonical) return null;

  for (const pattern of STATIC_PACKAGE_PATTERNS) {
    if (pattern.matches(canonical)) {
      return { packageId: pattern.packageId, pattern: pattern.name };
    }
  }

  const hl7UvMatch = isHost(canonical, 'hl7.org')
    ? canonical.path.match(/^\/fhir\/uv\/([^/]+)\//)
    : null;
  if (hl7UvMatch?.[1]) {
    const packageId = `hl7.fhir.uv.${hl7UvMatch[1]}`;
    if (!isSafePackageId(packageId)) return null;
    return {
      packageId,
      pattern: 'generic HL7 UV',
    };
  }

  if (isHost(canonical, 'medizininformatik-initiative.de')) {
    const packageId = detectMiiPackage(canonical);
    if (!packageId) return null;
    return {
      packageId,
      pattern: 'MII',
    };
  }

  return null;
}

export function isResolvableProfileCanonical(profileUrl: string): boolean {
  return parseProfileCanonical(profileUrl) !== null;
}

function parseProfileCanonical(profileUrl: string): ParsedProfileCanonical | null {
  const raw = profileUrl.trim();
  if (!raw || raw.length > 8192 || /[\0\r\n]/.test(raw)) return null;
  const separatorIndex = raw.indexOf('|');
  const canonicalUrl = separatorIndex < 0 ? raw : raw.slice(0, separatorIndex);
  const version = separatorIndex < 0 ? undefined : raw.slice(separatorIndex + 1);
  if (!canonicalUrl || version === '' || version?.includes('|')) return null;

  try {
    const parsed = new URL(canonicalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    return {
      hostname: parsed.hostname.toLowerCase(),
      path: parsed.pathname.toLowerCase(),
      version: version?.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function detectMiiPackage(canonical: ParsedProfileCanonical): string | null {
  const isMii2026 = canonical.version?.startsWith('2026.') === true
    || canonical.path.includes('/2026/');
  if (isMii2026 && hasAnyPathSegment(canonical, ['modul-person', 'modul-diagnose', 'modul-prozedur', 'modul-fall'])) {
    return 'de.medizininformatikinitiative.kerndatensatz.base';
  }

  const packageByModule: Array<[string[], string]> = [
    [['modul-meta'], 'de.medizininformatikinitiative.kerndatensatz.meta'],
    [['modul-person'], 'de.medizininformatikinitiative.kerndatensatz.person'],
    [['modul-labor'], 'de.medizininformatikinitiative.kerndatensatz.laborbefund'],
    [['modul-diagnose'], 'de.medizininformatikinitiative.kerndatensatz.diagnose'],
    [['modul-prozedur'], 'de.medizininformatikinitiative.kerndatensatz.prozedur'],
    [['modul-fall'], 'de.medizininformatikinitiative.kerndatensatz.fall'],
    [['modul-medikation'], 'de.medizininformatikinitiative.kerndatensatz.medikation'],
    [['modul-consent', 'consent'], 'de.medizininformatikinitiative.kerndatensatz.consent'],
    [['modul-bildgebung', 'bildgebung'], 'de.medizininformatikinitiative.kerndatensatz.bildgebung'],
    [['modul-biobank', 'biobank'], 'de.medizininformatikinitiative.kerndatensatz.biobank'],
    [['modul-molgen', 'molgen'], 'de.medizininformatikinitiative.kerndatensatz.molgen'],
    [['modul-onko', 'modul-onkologie', 'onkologie'], 'de.medizininformatikinitiative.kerndatensatz.onkologie'],
    [['modul-patho', 'patho'], 'de.medizininformatikinitiative.kerndatensatz.patho'],
    [['modul-icu', 'icu', 'intensivmedizin'], 'de.medizininformatikinitiative.kerndatensatz.icu'],
    [['modul-pro'], 'de.medizininformatikinitiative.kerndatensatz.pros'],
  ];
  for (const [segments, packageId] of packageByModule) {
    if (hasAnyPathSegment(canonical, segments)) return packageId;
  }
  if (canonical.path.includes('molekulargenetisch')) {
    return 'de.medizininformatikinitiative.kerndatensatz.molgen';
  }
  if (hasPathPrefix(canonical, '/fhir/core/structuredefinition/')) {
    return isMii2026
      ? 'de.medizininformatikinitiative.kerndatensatz.base'
      : 'de.medizininformatikinitiative.kerndatensatz.person';
  }
  return null;
}

function packagePattern(
  packageId: string,
  name: string,
  matches: PackagePattern['matches'],
): PackagePattern {
  return { packageId, name, matches };
}

function isHost(canonical: ParsedProfileCanonical, domain: string): boolean {
  return canonical.hostname === domain || canonical.hostname.endsWith(`.${domain}`);
}

function hasPathPrefix(canonical: ParsedProfileCanonical, prefix: string): boolean {
  return canonical.path.startsWith(prefix);
}

function hasPathSegment(canonical: ParsedProfileCanonical, segment: string): boolean {
  return canonical.path.split('/').includes(segment);
}

function hasAnyPathSegment(canonical: ParsedProfileCanonical, segments: string[]): boolean {
  return segments.some(segment => hasPathSegment(canonical, segment));
}
