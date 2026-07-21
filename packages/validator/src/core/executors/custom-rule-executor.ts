/**
 * Custom Rule Executor
 * 
 * Executes user-defined business rules (Custom Rules) against resources.
 * Fetches enabled rules from the embedder-provided custom rule source and
 * evaluates their FHIRPath expressions.
 */

import fhirpath from 'fhirpath';
import { getFhirPathModel } from '../../validators/fhirpath-model-resolver';
import { rewriteCollectionTypeOperators } from '../../validators/fhirpath-as-operator-rewrite';
import { checkFhirpathSandbox } from '../../validators/fhirpath-sandbox';
import { getCustomRulesSource } from '../../persistence';
import type { EngineCustomRule } from '../../persistence';
import { createValidationIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import type { StructureDefinition } from '../structure-definition-types';
import { logger } from '../../logger';

export interface CustomRuleValidationContext {
    resource: any;
    structureDef: StructureDefinition; // Optional/Unused for now, but kept for consistency
    fhirVersion?: 'R4' | 'R5' | 'R6';
    organizationId?: number;
}

export class CustomRuleExecutor {
    private static readonly RULE_LOAD_TIMEOUT_MS = 250;

    private async loadRules(resourceType: string, organizationId?: number): Promise<EngineCustomRule[]> {
        if (organizationId === undefined) {
            throw new Error('organizationId is required to load tenant custom rules');
        }

        const sourcePromise = getCustomRulesSource().getRulesByResourceType(resourceType, { organizationId });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
                reject(new Error(
                    `Custom rule source timed out after ${CustomRuleExecutor.RULE_LOAD_TIMEOUT_MS}ms`,
                ));
            }, CustomRuleExecutor.RULE_LOAD_TIMEOUT_MS);
            timeout.unref?.();
        });
        try {
            // Cache ownership belongs to the embedder. A second engine-local
            // cache used to survive host invalidation for five minutes.
            return await Promise.race([sourcePromise, timeoutPromise]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    /**
     * Validate user-defined custom rules
     */
    async validate(
        context: CustomRuleValidationContext
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];
        const { resource } = context;

        try {
            // Fetch enabled rules for this resource type. The source is
            // embedder-provided and defaults to a noop (returns []) when
            // no host has wired up a backing store.
            const rules = await this.loadRules(resource.resourceType, context.organizationId);

            if (rules.length === 0) {
                return issues;
            }

            logger.debug(`[CustomRuleExecutor] Validating ${resource.resourceType} against ${rules.length} custom rules`);

            for (const rule of rules) {
                try {
                    // Sandbox pre-flight: reject pathological customer-supplied
                    // expressions before fhirpath.js runs. fhirpath.js is
                    // synchronous — once it's running we cannot interrupt it,
                    // so the only reliable defence is static analysis of the
                    // expression string.
                    const sandbox = checkFhirpathSandbox(rule.expression);
                    if (!sandbox.ok) {
                        issues.push(createValidationIssue({
                            code: 'custom-rule-rejected-by-sandbox',
                            path: resource.resourceType,
                            resourceType: resource.resourceType,
                            customMessage: `Custom rule '${rule.name}' was not evaluated: ${sandbox.reason}`,
                            severityOverride: 'warning',
                            details: {
                                ruleId: rule.ruleId,
                                ruleName: rule.name,
                                sandboxMetrics: sandbox.metrics,
                            },
                        }));
                        continue;
                    }

                    // Evaluate FHIRPath expression
                    // Rule passes if result is true or non-empty
                    const result = fhirpath.evaluate(
                        resource,
                        rewriteCollectionTypeOperators(rule.expression),
                        {
                            resource,
                            rootResource: resource,
                            context: resource
                        },
                        getFhirPathModel(context.fhirVersion),
                        // Suppress fhirpath.js trace() output (causes TRACE:[unmatched] [] logs)
                        { traceFn: () => { } }
                    );

                    const passed = this.checkResult(result);

                    if (!passed) {
                        issues.push(createValidationIssue({
                            code: 'custom-rule-violation',
                            path: resource.resourceType, // Uses resourceType; per-field paths can be added when rules define them
                            resourceType: resource.resourceType,
                            customMessage: rule.validationMessage || `Custom rule '${rule.name}' failed`,
                            severityOverride: rule.severity,
                            details: {
                                ruleId: rule.ruleId,
                                ruleName: rule.name,
                                expression: rule.expression,
                                category: rule.category
                            }
                        }));
                    }

                } catch (ruleError) {
                    logger.warn(`[CustomRuleExecutor] Error evaluating rule '${rule.name}':`, ruleError);
                    issues.push(createValidationIssue({
                        code: 'custom-rule-evaluation-error',
                        path: resource.resourceType,
                        resourceType: resource.resourceType,
                        customMessage: `Failed to evaluate custom rule '${rule.name}'`,
                        severityOverride: 'warning', // Don't fail validation for bad rule syntax
                        details: {
                            ruleId: rule.ruleId,
                            error: ruleError instanceof Error ? ruleError.message : String(ruleError)
                        }
                    }));
                }
            }

            return issues;

        } catch (error) {
            // Failing open would report a resource as clean without executing
            // tenant policy. Surface a warning so the result is explicitly
            // incomplete while keeping an infrastructure outage from becoming
            // a resource-level error.
            logger.warn(
                `[CustomRuleExecutor] Custom rule source unavailable: ` +
                (error instanceof Error ? error.message : String(error))
            );
            return [createValidationIssue({
                code: 'custom-rule-source-unavailable',
                path: resource.resourceType,
                resourceType: resource.resourceType,
                customMessage: 'Custom rules could not be loaded; this validation result is incomplete',
                severityOverride: 'warning',
                aspectOverride: 'custom_rule',
                details: { sourceStatus: 'unavailable' },
            })];
        }
    }

    /**
     * Check if result implies success (truthy or non-empty)
     */
    private checkResult(result: any): boolean {
        if (result === true) return true;
        if (result === false) return false;
        if (Array.isArray(result)) {
            if (result.length === 0) return false;
            // If array contains boolean false, it's failed? FHIRPath semantics:
            // "Non-empty collections are true"
            // BUT: [false] -> usually means result of comparison is false.
            if (result.length === 1 && result[0] === false) return false;
            return true;
        }
        return !!result;
    }
}
