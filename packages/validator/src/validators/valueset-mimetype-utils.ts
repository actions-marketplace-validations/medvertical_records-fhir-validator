const MIME_TYPES_VALUE_SET_URL = 'http://hl7.org/fhir/ValueSet/mimetypes';
const MIME_TYPE_SYSTEM = 'urn:ietf:bcp:13';
const MIME_TOKEN = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
const MIME_QUOTED_STRING = String.raw`"(?:[\t !#-\[\]-~]|\\[\t !-~])*"`;
const MIME_PARAMETER = `(?:${MIME_TOKEN})=(?:${MIME_TOKEN}|${MIME_QUOTED_STRING})`;
const MIME_TYPE_PATTERN = new RegExp(`^${MIME_TOKEN}/${MIME_TOKEN}(?:\\s*;\\s*${MIME_PARAMETER})*$`);
const SIMPLE_FHIR_FORMAT_CODES = new Set(['xml', 'json', 'ttl']);
const SIMPLE_FHIR_FORMAT_BINDING_PATHS = new Set([
  'CapabilityStatement.format',
  'Signature.targetFormat',
]);

export function isMimeTypesValueSet(valueSetUrl: string): boolean {
  return valueSetUrl.split('|')[0] === MIME_TYPES_VALUE_SET_URL;
}

export function validateMimeTypeBindingCode(code: string, system?: string, elementPath?: string): boolean {
  if (!system && elementPath && allowsSimpleFhirFormatCode(elementPath) && SIMPLE_FHIR_FORMAT_CODES.has(code)) {
    return true;
  }

  const systemMatches = !system || system === MIME_TYPE_SYSTEM;
  return systemMatches && MIME_TYPE_PATTERN.test(code);
}

function allowsSimpleFhirFormatCode(elementPath: string): boolean {
  const normalizedPath = elementPath.replace(/\[\d+\]/g, '');
  return SIMPLE_FHIR_FORMAT_BINDING_PATHS.has(normalizedPath);
}
