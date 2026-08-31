import type { ProfileSourceContext } from '../../persistence';
import type { ValidationIssue } from '../../types';
import type { ValueSetCache } from '../../validators/valueset-cache';
import { UcumCodeValidator } from '../../validators/ucum-validator';
import type { StructureDefinition } from '../structure-definition-types';
import { CodeSystemReferenceLookupCache } from './terminology-code-system-reference-rules';
import { TerminologyElementPlanCache } from './terminology-element-plan-cache';
import { validateTerminologyElement } from './terminology-element-validator';
import { appendTerminologyFailure } from './terminology-executor-helpers';
import { createTerminologyGlobalRules } from './terminology-global-rule-plan';
import { TerminologySlicePlanCache } from './terminology-slice-plan-cache';
import type { TerminologyValidationPort } from './terminology-validation-port';

export interface TerminologyValidationContext {
  resource: unknown;
  structureDef: StructureDefinition;
  getValueAtPath: (resource: unknown, path: string) => unknown;
  fhirVersion?: 'R4' | 'R5' | 'R6';
  sourceContext?: ProfileSourceContext;
}

/** Coordinates terminology validation rules and their runtime caches. */
export class TerminologyValidationPipeline {
  private readonly elementPlanCache = new TerminologyElementPlanCache();
  private readonly slicePlanCache = new TerminologySlicePlanCache();
  private readonly codeSystemReferenceLookupCache = new CodeSystemReferenceLookupCache();
  private readonly ucumValidator = new UcumCodeValidator();

  constructor(
    private readonly valueSetValidator: TerminologyValidationPort,
    private readonly valueSetCache: ValueSetCache,
  ) {}

  clearCache(): void {
    this.codeSystemReferenceLookupCache.clear();
    this.ucumValidator.clear();
  }

  async validate(context: TerminologyValidationContext): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const failureMessages = new Set<string>();
    const { resource, structureDef, getValueAtPath, sourceContext } = context;
    const profileUrl = typeof structureDef.url === 'string' ? structureDef.url : undefined;
    const fhirVersion = context.fhirVersion ?? 'R4';

    for (const elementDef of this.elementPlanCache.get(structureDef)) {
      try {
        issues.push(
          ...(await validateTerminologyElement(
            {
              resource,
              elementDef,
              structureDef,
              getValueAtPath,
              profileUrl,
              fhirVersion,
              sourceContext,
            },
            {
              valueSetCache: this.valueSetCache,
              valueSetValidator: this.valueSetValidator,
              slicePlanCache: this.slicePlanCache,
              codeSystemReferenceLookupCache: this.codeSystemReferenceLookupCache,
              ucumValidator: this.ucumValidator,
            },
          )),
        );
      } catch (error) {
        appendTerminologyFailure(
          issues,
          failureMessages,
          error,
          resource,
          structureDef,
          profileUrl,
          elementDef.path,
        );
      }
    }

    const globalRules = createTerminologyGlobalRules({
      resource,
      existingIssues: issues,
      ucumValidator: this.ucumValidator,
      valueSetValidator: this.valueSetValidator,
      fhirVersion,
      sourceContext,
    });
    for (const rule of globalRules) {
      try {
        issues.push(...(await rule()));
      } catch (error) {
        appendTerminologyFailure(
          issues,
          failureMessages,
          error,
          resource,
          structureDef,
          profileUrl,
        );
      }
    }
    return issues;
  }
}
