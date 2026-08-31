/** Normalize Records severity names to the HL7 OperationOutcome vocabulary. */
export function normalizeToHl7Severity(
  severity: string | undefined,
): 'fatal' | 'error' | 'warning' | 'information' {
  switch (severity) {
    case 'fatal': return 'fatal';
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'information':
    case 'info': return 'information';
    case 'inherit': return 'warning';
    default: return 'information';
  }
}
