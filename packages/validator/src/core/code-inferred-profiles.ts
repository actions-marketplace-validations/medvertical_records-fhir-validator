/**
 * FHIR R4+ requires a number of core Observation profiles to be applied when
 * their defining LOINC or SNOMED CT codes are present, even if meta.profile is
 * absent. Keep this ordered: the reference validator applies the first match.
 */

type CodingSystem = 'http://loinc.org' | 'http://snomed.info/sct';

interface CodeProfileRule {
  system: CodingSystem;
  codes: ReadonlySet<string>;
  profileUrl: string;
}

const codeSet = (...codes: string[]): ReadonlySet<string> => new Set(codes);

const OBSERVATION_CODE_PROFILE_RULES: readonly CodeProfileRule[] = [
  {
    system: 'http://loinc.org',
    codes: codeSet('85353-1'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/vitalspanel',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('9279-1', '76170-0', '76172-6', '76171-8', '19840-8', '33438-3', '76270-8', '11291-2'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/resprate',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet(
      '60978-4', '73795-7', '73799-9', '76476-1', '76477-9', '8867-4',
      '8889-8', '8890-6', '8891-4', '8892-2', '8893-0', '40443-4',
      '55425-3', '68999-2', '11328-2', '69000-8', '8886-4',
    ),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/heartrate',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('2708-6', '19224-5', '20564-1', '2709-4', '2710-2', '2713-6', '51733-4', '59408-5', '59417-6', '89276-0', '97549-0'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/oxygensat',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet(
      '8310-5', '60834-9', '60835-6', '60836-4', '60838-0', '60955-2',
      '61009-7', '75539-7', '75987-8', '76010-8', '76011-6', '76278-1',
      '8309-7', '8328-7', '8329-5', '8330-3', '8331-1', '8332-9',
      '8333-7', '8334-5', '91371-5', '98657-0', '98663-8',
    ),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodytemp',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('8302-2', '3137-7', '3138-5', '8306-3', '8308-9'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodyheight',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('9843-4', '8287-5'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/headcircum',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('29463-7', '3141-9', '3142-7', '75292-3', '79348-9', '8350-1', '8351-9'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodyweight',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('39156-5', '89270-3'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bmi',
  },
  {
    system: 'http://loinc.org',
    codes: codeSet('85354-9', '35094-2', '8459-0', '76534-7', '55284-4', '8480-6'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bp',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('46680005'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/vitalspanel',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('86290005', '271625008', '271306003'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/resprate',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('271306003', '249043002', '444981005', '399017001', '251670001', '429525003', '429614003'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/heartrate',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('442476006', '431314004'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/oxygensat',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet(
      '386725007', '276885007', '300076005', '1222808002', '364246006',
      '307047009', '708499008', '431598003', '698831002', '698832009',
      '415882003', '415974002', '415929009', '415945006',
    ),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodytemp',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('1153637007', '1162419008', '50373000', '1162418000', '1230278008', '1162392001', '1162417005'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodyheight',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('363812007', '169876006', '1269262007', '363811000'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/headcircum',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('735395000', '425024002', '424927000', '784399000', '1162416001', '1162415002'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bodyweight',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet('60621009'),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bmi',
  },
  {
    system: 'http://snomed.info/sct',
    codes: codeSet(
      '251076008', '163033001', '163035008', '386534000', '386536003',
      '271649006', '271650006', '407556006', '407554009', '716579001', '399304008',
    ),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/bp',
  },
];

interface ObservationLike {
  resourceType?: unknown;
  code?: { coding?: unknown };
}

interface CodingLike {
  system?: unknown;
  code?: unknown;
}

export interface CodeInferredProfileMatch {
  profileUrl: string;
  system: CodingSystem;
  code: string;
}

/** Return the single FHIR-implied Observation profile, if any. */
export function inferCodeBasedProfiles(resource: unknown): string[] {
  const match = matchCodeInferredProfile(resource);
  return match ? [match.profileUrl] : [];
}

/**
 * Like {@link inferCodeBasedProfiles}, but keeps the triggering coding so
 * callers can attribute downstream findings to the implied profile.
 */
export function matchCodeInferredProfile(resource: unknown): CodeInferredProfileMatch | null {
  if (!isRecord(resource) || resource.resourceType !== 'Observation') return null;

  const observation = resource as ObservationLike;
  const codings = Array.isArray(observation.code?.coding)
    ? observation.code.coding.filter(isRecord) as CodingLike[]
    : [];

  for (const rule of OBSERVATION_CODE_PROFILE_RULES) {
    const triggeringCoding = codings.find(coding => coding.system === rule.system &&
      typeof coding.code === 'string' && rule.codes.has(coding.code));
    if (typeof triggeringCoding?.code === 'string') {
      return { profileUrl: rule.profileUrl, system: rule.system, code: triggeringCoding.code };
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
