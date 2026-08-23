import type { SubsumptionOutcome } from './terminology-api-types';
import {
  getNestedString,
  getOperationOutcomeIssueValues,
  getParametersEntries,
  isTerminologyResponseRecord,
} from './terminology-response-utils';

const SUBSUMPTION_OUTCOMES = new Set<SubsumptionOutcome>([
  'subsumes',
  'subsumed-by',
  'equivalent',
  'not-subsumed',
  'unknown',
]);

export function validateCodeSucceeded(parameters: unknown): boolean {
  const entries = getParametersEntries(parameters);
  if (!entries) return false;
  const resultParam = entries.find(parameter => parameter.name === 'result');
  return resultParam?.valueBoolean === true;
}

export function extractSubsumptionOutcome(parameters: unknown): SubsumptionOutcome | undefined {
  const entries = getParametersEntries(parameters);
  if (!entries) return undefined;
  const outcomeParam = entries.find(parameter => parameter.name === 'outcome');
  const outcome = outcomeParam?.valueCode;
  return typeof outcome === 'string' && SUBSUMPTION_OUTCOMES.has(outcome as SubsumptionOutcome)
    ? outcome as SubsumptionOutcome
    : undefined;
}

export function operationOutcomeCannotResolveBinding(outcome: unknown): boolean {
  const issues = getOperationOutcomeIssueValues(outcome);
  if (!issues) return false;
  return issues.some(issue =>
    isTerminologyResponseRecord(issue) &&
    (
      issue.code === 'not-found' ||
      /could not be (?:found|resolved)|unable to (?:find|resolve)|not.*resolved/i.test(
        getNestedString(issue, 'details', 'text') ?? '',
      )
    )
  );
}
