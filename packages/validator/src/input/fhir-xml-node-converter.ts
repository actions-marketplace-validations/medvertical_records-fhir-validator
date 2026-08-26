import type { SaxesAttributeNS, SaxesTagNS } from 'saxes';
import type { FhirInputLocation, ParsedFhirInput } from './fhir-input-types';

export const FHIR_XML_NAMESPACE = 'http://hl7.org/fhir';
export const XHTML_XML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

const COMMON_REPEATING_ELEMENTS = new Set([
  'address', 'agent', 'alias', 'answer', 'author', 'basedOn', 'category', 'coding',
  'communication', 'component', 'constraint', 'contained', 'contact', 'diagnosis',
  'element', 'endpoint', 'entity', 'entry', 'extension', 'generalPractitioner', 'given',
  'identifier', 'image', 'imagingStudy', 'insurance', 'issue', 'item', 'line',
  'link', 'modifierExtension', 'note', 'parameter', 'participant',
  'performer', 'profile', 'reasonCode', 'reasonReference', 'referenceRange',
  'section', 'security', 'specialty', 'supportingInfo', 'tag', 'telecom',
]);
const REPEATING_PARENT_CHILD = new Set([
  'Encounter.location', 'Encounter.type', 'EpisodeOfCare.type',
  'HealthcareService.location', 'HealthcareService.type', 'Location.type',
  'Organization.type', 'Patient.name', 'Person.name', 'Practitioner.name',
  'PractitionerRole.location', 'RelatedPerson.name',
  'SubscriptionStatus.notificationEvent',
]);
const BOOLEAN_ELEMENTS = new Set([
  'abstract', 'active', 'caseSensitive', 'compositional', 'experimental',
  'immutable', 'isModifier', 'isSummary', 'mustSupport', 'preferred',
  'readOnly', 'required', 'userSelected', 'versionNeeded',
]);
const NUMERIC_ELEMENTS = new Set([
  'count', 'denominator', 'factor', 'min', 'numerator', 'offset', 'rank',
  'score', 'sequence', 'total',
]);
const NUMERIC_VALUE_PARENTS = new Set([
  'Age', 'Count', 'Distance', 'Duration', 'Money', 'Quantity', 'SimpleQuantity',
]);
const DECIMAL_ELEMENTS = new Set(['factor', 'offset', 'score']);
const UNSAFE_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export interface XmlNode {
  local: string;
  name: string;
  uri: string;
  attributes: Array<{ local: string; name: string; uri: string; value: string }>;
  children: XmlNode[];
  content: Array<XmlNode | string>;
  location: FhirInputLocation;
}

interface ConvertedNode {
  value: unknown;
  primitiveSidecar?: Record<string, unknown>;
}

const PRIMITIVE_CHOICE_ELEMENT = /^value(?:Base64Binary|Boolean|Canonical|Code|Date|DateTime|Decimal|Id|Instant|Integer|Integer64|Markdown|Oid|PositiveInt|String|Time|UnsignedInt|Uri|Url|Uuid)$/;

export function createXmlNode(tag: SaxesTagNS, location: FhirInputLocation): XmlNode {
  return {
    local: tag.local,
    name: tag.name,
    uri: tag.uri,
    attributes: Object.values(tag.attributes).map((item: SaxesAttributeNS) => ({
      local: item.local,
      name: item.name,
      uri: item.uri,
      value: item.value,
    })),
    children: [],
    content: [],
    location,
  };
}

export function convertFhirXmlRoot(
  root: XmlNode,
  sourceMap: ParsedFhirInput['sourceMap'],
): Record<string, unknown> {
  const converted = convertNode(root, root.local, sourceMap, true);
  if (!converted.value || typeof converted.value !== 'object' || Array.isArray(converted.value)) {
    throw new Error('FHIR XML root did not normalize to a resource object');
  }
  return converted.value as Record<string, unknown>;
}

function convertNode(
  node: XmlNode,
  path: string,
  sourceMap: ParsedFhirInput['sourceMap'],
  rootResource = false,
  parentLocal?: string,
): ConvertedNode {
  sourceMap[path] = node.location;
  if (node.uri === XHTML_XML_NAMESPACE && node.local === 'div') {
    return { value: serializeXml(node) };
  }
  if (
    (node.local === 'resource' || node.local === 'contained')
    && node.children.length === 1
    && node.children[0].uri === FHIR_XML_NAMESPACE
  ) {
    return convertNode(node.children[0], path, sourceMap, true, node.local);
  }

  const rawValue = attribute(node, 'value');
  const id = attribute(node, 'id');
  const url = attribute(node, 'url');
  if (rawValue === undefined && PRIMITIVE_CHOICE_ELEMENT.test(node.local)) {
    const sidecar: Record<string, unknown> = {};
    if (id) sidecar.id = id;
    for (const child of node.children) {
      const childConverted = convertNode(child, `${path}._${child.local}`, sourceMap, false, node.local);
      setProperty(sidecar, child.local, childConverted.value, isRepeatingElement(node.local, child.local));
    }
    return Object.keys(sidecar).length > 0
      ? { value: undefined, primitiveSidecar: sidecar }
      : { value: {} };
  }
  if (rawValue !== undefined) {
    const converted: ConvertedNode = { value: primitiveValue(parentLocal, node.local, rawValue) };
    if (id || node.children.length > 0) {
      const sidecar: Record<string, unknown> = {};
      if (id) sidecar.id = id;
      for (const child of node.children) {
        const childConverted = convertNode(child, `${path}._${child.local}`, sourceMap, false, node.local);
        setProperty(sidecar, child.local, childConverted.value, isRepeatingElement(node.local, child.local));
      }
      converted.primitiveSidecar = sidecar;
    }
    return converted;
  }

  const output: Record<string, unknown> = {};
  if (rootResource) output.resourceType = node.local;
  if (id) output.id = id;
  if (url) output.url = url;
  for (const child of node.children) {
    const forceArray = isRepeatingElement(node.local, child.local);
    const existing = output[child.local];
    const index = Array.isArray(existing) ? existing.length : existing === undefined ? 0 : 1;
    const array = forceArray || existing !== undefined;
    const converted = convertNode(child, childPath(path, child.local, index, array), sourceMap, false, node.local);
    const valueIndex = converted.value === undefined && converted.primitiveSidecar
      ? 0
      : setProperty(output, child.local, converted.value, forceArray);
    const existingSidecar = output[`_${child.local}`];
    if (array && existingSidecar !== undefined && !Array.isArray(existingSidecar)) {
      output[`_${child.local}`] = [existingSidecar];
    }
    if (converted.primitiveSidecar) {
      setPrimitiveSidecar(output, child.local, converted.primitiveSidecar, valueIndex, array);
      sourceMap[childPath(path, `_${child.local}`, valueIndex, array)] = child.location;
    }
  }
  return { value: output };
}

function primitiveValue(parent: string | undefined, name: string, value: string): string | number | boolean {
  const booleanElement = BOOLEAN_ELEMENTS.has(name) || name.endsWith('Boolean');
  if (booleanElement && value === 'true') return true;
  if (booleanElement && value === 'false') return false;
  if (name.endsWith('Integer64')) return value;
  const numericElement = NUMERIC_ELEMENTS.has(name)
    || /(?:Decimal|Integer|PositiveInt|UnsignedInt)$/.test(name)
    || (name === 'value' && parent !== undefined && NUMERIC_VALUE_PARENTS.has(parent));
  const exponentAllowed = name.endsWith('Decimal')
    || DECIMAL_ELEMENTS.has(name)
    || (name === 'value' && parent !== undefined && NUMERIC_VALUE_PARENTS.has(parent));
  const validNumericLexeme = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value);
  if (numericElement && validNumericLexeme && (exponentAllowed || !/[eE]/.test(value))) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return value;
}

function setProperty(output: Record<string, unknown>, name: string, value: unknown, forceArray: boolean): number {
  if (UNSAFE_PROPERTY_NAMES.has(name)) throw new Error(`FHIR XML contains unsafe element name: ${name}`);
  const current = output[name];
  if (current === undefined) {
    output[name] = forceArray ? [value] : value;
    return 0;
  }
  if (Array.isArray(current)) {
    current.push(value);
    return current.length - 1;
  }
  output[name] = [current, value];
  return 1;
}

function setPrimitiveSidecar(
  output: Record<string, unknown>,
  name: string,
  sidecar: Record<string, unknown>,
  index: number,
  array: boolean,
): void {
  const sidecarName = `_${name}`;
  if (!array) {
    setProperty(output, sidecarName, sidecar, false);
    return;
  }
  const current = output[sidecarName];
  const values: unknown[] = Array.isArray(current) ? current : current === undefined ? [] : [current];
  while (values.length < index) values.push(null);
  values[index] = sidecar;
  output[sidecarName] = values;
}

function attribute(node: XmlNode, local: string): string | undefined {
  return node.attributes.find((candidate) => candidate.local === local && candidate.uri === '')?.value;
}

function isRepeatingElement(parent: string, child: string): boolean {
  return COMMON_REPEATING_ELEMENTS.has(child) || REPEATING_PARENT_CHILD.has(`${parent}.${child}`);
}

function childPath(parentPath: string, name: string, index: number, array: boolean): string {
  return `${parentPath}.${name}${array ? `[${index}]` : ''}`;
}

function serializeXml(node: XmlNode): string {
  const attributes = node.attributes
    .map((item) => ` ${item.name}="${escapeAttribute(item.value)}"`)
    .join('');
  const content = node.content
    .map((item) => typeof item === 'string' ? escapeText(item) : serializeXml(item))
    .join('');
  return content
    ? `<${node.name}${attributes}>${content}</${node.name}>`
    : `<${node.name}${attributes}/>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
