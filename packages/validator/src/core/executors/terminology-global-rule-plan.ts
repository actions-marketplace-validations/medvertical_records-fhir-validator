import type { ProfileSourceContext } from '../../persistence';
import type { ValidationIssue } from '../../types';
import type { UcumCodeValidator } from '../../validators/ucum-validator';
import { validateCodingHygiene } from './terminology-coding-hygiene-rules';
import { validateKnownLoincDisplays } from './terminology-display-rules';
import { validateDeepLocalCodings } from './terminology-local-coding-rules';
import type { TerminologyValidationPort } from './terminology-validation-port';

interface TerminologyGlobalRuleContext {
  resource: unknown;
  existingIssues: ValidationIssue[];
  valueSetValidator: TerminologyValidationPort;
  ucumValidator: UcumCodeValidator;
  fhirVersion: 'R4' | 'R5' | 'R6';
  sourceContext?: ProfileSourceContext;
}

export type TerminologyGlobalRule = () => ValidationIssue[] | Promise<ValidationIssue[]>;

export function createTerminologyGlobalRules(
  context: TerminologyGlobalRuleContext,
): TerminologyGlobalRule[] {
  return [
    () => validateKnownLoincDisplays(context.resource),
    () => validateCodingHygiene(
      context.resource,
      context.existingIssues,
      context.ucumValidator,
    ),
    () => validateDeepLocalCodings(
      context.resource,
      context.existingIssues,
      context.valueSetValidator,
      context.fhirVersion,
      context.sourceContext,
    ),
  ];
}
