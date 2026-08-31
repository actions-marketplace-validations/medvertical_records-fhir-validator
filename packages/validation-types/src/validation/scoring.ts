/**
 * Canonical issue-count score used for a single validated resource.
 *
 * Run-level conformance scores use resource coverage instead; this helper is
 * deliberately limited to issue-count scoring so callers cannot mix the two
 * meanings accidentally.
 */
export function calculateValidationIssueScore(
  errorCount: number,
  warningCount: number,
  informationCount: number,
): number {
  const score = 100 - (errorCount * 15) - (warningCount * 5) - informationCount;
  return Math.max(0, Math.round(score));
}
