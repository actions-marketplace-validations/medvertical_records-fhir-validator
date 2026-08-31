/**
 * HL7 OperationOutcome issue-type vocabulary shared by the prefix mapping
 * modules (http://hl7.org/fhir/valueset-issue-type.html).
 */

export const HL7_ISSUE_TYPE_LIST = [
  'invalid', 'structure', 'required', 'value', 'invariant',
  'security', 'login', 'unknown', 'expired', 'forbidden', 'suppressed',
  'processing', 'not-supported', 'duplicate', 'multiple-matches',
  'not-found', 'deleted', 'too-long', 'code-invalid', 'extension',
  'too-costly', 'business-rule', 'conflict',
  'transient', 'lock-error', 'no-store', 'exception', 'timeout',
  'incomplete', 'throttled',
  'informational',
] as const;

export type Hl7IssueType = (typeof HL7_ISSUE_TYPE_LIST)[number];

export const HL7_ISSUE_TYPES = new Set<string>(HL7_ISSUE_TYPE_LIST);
