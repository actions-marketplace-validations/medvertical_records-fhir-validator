import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { STATUS_CONSISTENCY, WG_CONTACT_URL, WG_PUBLISHER } from './sd-wg-mappings';

export function validateStructureDefinitionWgConsistency(resource: any): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const resourceType = resource.resourceType;

  const wgExt = (resource.extension || []).find(
    (extension: any) => extension?.url === 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg'
  );
  if (!wgExt?.valueCode) return issues;

  const wg = wgExt.valueCode;
  const expectedPublisher = WG_PUBLISHER[wg];

  if (expectedPublisher && resource.publisher && !publisherMatchesWg(resource.publisher, expectedPublisher)) {
    issues.push(createValidationIssue({
      code: 'business-rule-wg-publisher',
      path: resourceType,
      resourceType,
      customMessage:
        `The nominated WG '${wg}' means that the publisher should be ` +
        `'${expectedPublisher}' but '${resource.publisher}' was found`,
      severityOverride: 'warning',
    }));
  }

  const expectedUrl = WG_CONTACT_URL[wg];
  if (expectedUrl) {
    const allContactUrls = extractContactUrls(resource.contact);
    if (!allContactUrls.some(url => contactUrlMatchesWg(url, expectedUrl))) {
      issues.push(createValidationIssue({
        code: 'business-rule-wg-contact',
        path: resourceType,
        resourceType,
        customMessage:
          `The nominated WG '${wg}' means that the contact url should be ` +
          `'${expectedUrl}' but it was not found`,
        severityOverride: 'warning',
      }));
    }
  }

  return issues;
}

export function validateStructureDefinitionStatusConsistency(sd: any): ValidationIssue[] {
  const stdStatusExt = (sd.extension || []).find(
    (extension: any) => extension?.url === 'http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status'
  );
  if (!stdStatusExt?.valueCode || !sd.status) return [];

  const allowed = STATUS_CONSISTENCY[stdStatusExt.valueCode];
  if (allowed && !allowed.includes(sd.status)) {
    return [createValidationIssue({
      code: 'business-rule-sd-status-consistency',
      path: 'StructureDefinition',
      resourceType: 'StructureDefinition',
      customMessage:
        `The resource status '${sd.status}' and the standards status '${stdStatusExt.valueCode}' are not consistent`,
      severityOverride: 'warning',
    })];
  }
  return [];
}

function extractContactUrls(contacts: any[] | undefined): string[] {
  if (!Array.isArray(contacts)) return [];
  const urls: string[] = [];
  for (const contact of contacts) {
    for (const telecom of contact?.telecom || []) {
      if (telecom?.system === 'url' && telecom.value) urls.push(telecom.value);
    }
  }
  return urls;
}

function publisherMatchesWg(actual: string, expected: string): boolean {
  return normalizeWgPublisher(actual) === normalizeWgPublisher(expected);
}

function normalizeWgPublisher(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bhealth\s+level\s+seven\b/g, 'hl7')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function contactUrlMatchesWg(actual: string, expected: string): boolean {
  const normalizedActual = normalizeWgContactUrl(actual);
  const normalizedExpected = normalizeWgContactUrl(expected);
  return normalizedActual === normalizedExpected ||
    normalizedActual.startsWith(`${normalizedExpected}/`);
}

function normalizeWgContactUrl(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/index\.(cfm|html?)$/, '')
    .replace(/\/$/, '');
}
