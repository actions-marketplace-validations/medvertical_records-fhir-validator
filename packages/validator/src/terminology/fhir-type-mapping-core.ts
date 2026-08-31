const FHIRPATH_TYPE_SYSTEM = 'http://hl7.org/fhirpath/System.';

const FHIRPATH_TO_FHIR_MAP: Record<string, string[]> = {
  'http://hl7.org/fhirpath/System.String': [
    'string', 'id', 'code', 'uri', 'url', 'canonical',
    'oid', 'uuid', 'markdown', 'xhtml'
  ],
  'http://hl7.org/fhirpath/System.Integer': [
    'integer', 'unsignedInt', 'positiveInt'
  ],
  'http://hl7.org/fhirpath/System.Decimal': [
    'decimal'
  ],
  'http://hl7.org/fhirpath/System.Boolean': [
    'boolean'
  ],
  'http://hl7.org/fhirpath/System.DateTime': [
    'dateTime', 'instant'
  ],
  'http://hl7.org/fhirpath/System.Date': [
    'date'
  ],
  'http://hl7.org/fhirpath/System.Time': [
    'time'
  ]
};

const FHIR_PRIMITIVES = new Set([
  'string', 'id', 'code', 'uri', 'url', 'canonical', 'oid', 'uuid', 'markdown', 'xhtml',
  'integer', 'unsignedInt', 'positiveInt', 'decimal',
  'boolean',
  'date', 'dateTime', 'instant', 'time',
  'base64Binary'
]);

const TYPE_CATEGORIES: Record<string, string> = {
  'string': 'string',
  'id': 'string',
  'code': 'string',
  'uri': 'string',
  'url': 'string',
  'canonical': 'string',
  'oid': 'string',
  'uuid': 'string',
  'markdown': 'string',
  'xhtml': 'string',
  'integer': 'integer',
  'unsignedInt': 'integer',
  'positiveInt': 'integer',
  'decimal': 'decimal',
  'boolean': 'boolean',
  'dateTime': 'dateTime',
  'instant': 'dateTime',
  'date': 'date',
  'time': 'time',
  'base64Binary': 'binary'
};

export function isFhirPrimitive(typeCode: string): boolean {
  return FHIR_PRIMITIVES.has(typeCode);
}

export function isFhirPathTypeUrl(typeCode: string): boolean {
  return typeCode.startsWith(FHIRPATH_TYPE_SYSTEM);
}

export function fhirPathToFhirPrimitive(fhirPathUrl: string): string | null {
  const primitives = FHIRPATH_TO_FHIR_MAP[fhirPathUrl];
  return primitives ? primitives[0] : null;
}

export function fhirPathToAllFhirPrimitives(fhirPathUrl: string): string[] {
  return FHIRPATH_TO_FHIR_MAP[fhirPathUrl] || [];
}

export function getTypeCategory(typeCode: string): string {
  return TYPE_CATEGORIES[typeCode] || typeCode;
}

export function fhirToFhirPathType(fhirType: string): string | null {
  for (const [fhirPathUrl, fhirPrimitives] of Object.entries(FHIRPATH_TO_FHIR_MAP)) {
    if (fhirPrimitives.includes(fhirType)) {
      return fhirPathUrl;
    }
  }

  return null;
}
