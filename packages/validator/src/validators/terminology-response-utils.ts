export type TerminologyResponseRecord = Record<string, unknown>;

export function isTerminologyResponseRecord(
  value: unknown,
): value is TerminologyResponseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getParametersEntries(
  value: unknown,
): TerminologyResponseRecord[] | null {
  if (
    !isTerminologyResponseRecord(value) ||
    value.resourceType !== 'Parameters' ||
    !Array.isArray(value.parameter)
  ) {
    return null;
  }
  return value.parameter.filter(isTerminologyResponseRecord);
}

export function getOperationOutcomeIssueValues(value: unknown): unknown[] | null {
  if (
    !isTerminologyResponseRecord(value) ||
    value.resourceType !== 'OperationOutcome' ||
    !Array.isArray(value.issue)
  ) {
    return null;
  }
  return value.issue;
}

export function getNestedString(
  value: unknown,
  ...path: string[]
): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isTerminologyResponseRecord(current)) return undefined;
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}
