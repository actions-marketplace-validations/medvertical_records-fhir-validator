import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { logger } from '../logger';
import { validateQuestionnaireAnswerTypes } from './questionnaire-answer-validator';
import {
    buildQuestionnaireAnswerMap,
    isQuestionnaireItemEnabled,
} from './questionnaire-enable-when';
import { validateQuestionnaireItems } from './questionnaire-item-validator';
import { validateQuestionnaireSdcConstraints } from './questionnaire-sdc-validator';
import { valueSetCache } from './valueset-cache';
import type {
    QuestionnaireItem,
    QuestionnaireResponseAnswer,
    QuestionnaireResponseItem,
} from './questionnaire-types';

export type {
    AnswerOption,
    EnableWhen,
    QuestionnaireItem,
    QuestionnaireResponseAnswer,
    QuestionnaireResponseItem,
} from './questionnaire-types';

export interface QuestionnaireValidationOptions {
    warnOnUnresolvedQuestionnaireReference?: boolean;
}

export class QuestionnaireValidator {

    validateAnyResource(
        resource: any,
        contextQuestionnaire?: any,
        options: QuestionnaireValidationOptions = {},
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
    ): ValidationIssue[] {
        if (!resource || typeof resource !== 'object') return [];
        const issues: ValidationIssue[] = [];

        const rt = resource.resourceType;
        if (rt === 'Questionnaire') {
            issues.push(...this.validateQuestionnaire(resource, 'Questionnaire', fhirVersion));
        } else if (rt === 'QuestionnaireResponse') {
            let q = contextQuestionnaire;
            if (!q && typeof resource.questionnaire === 'string' && resource.questionnaire.startsWith('#')) {
                const id = resource.questionnaire.slice(1);
                const contained = Array.isArray(resource.contained) ? resource.contained : [];
                q = contained.find((c: any) => c?.id === id && c?.resourceType === 'Questionnaire');
            }
            issues.push(...this.validateQuestionnaireResponse(resource, q, options));
        }

        if (Array.isArray(resource.contained)) {
            for (let i = 0; i < resource.contained.length; i++) {
                const c = resource.contained[i];
                const cPath = `${rt}.contained[${i}]`;
                if (c?.resourceType === 'Questionnaire') {
                    issues.push(...this.validateQuestionnaire(c, cPath, fhirVersion));
                }
            }
        }

        return issues;
    }

    validateQuestionnaire(
        questionnaire: any,
        basePath: string = 'Questionnaire',
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4',
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (questionnaire?.resourceType !== 'Questionnaire') {
            return issues;
        }

        logger.debug('[QuestionnaireValidator] Validating Questionnaire');

        if (!questionnaire.status) {
            issues.push(createValidationIssue({
                code: 'questionnaire-missing-status',
                path: `${basePath}.status`,
                resourceType: 'Questionnaire',
                customMessage: 'Questionnaire.status is required',
                severityOverride: 'error',
            }));
        }

        if (questionnaire.name !== undefined && questionnaire.name !== null) {
            const name = String(questionnaire.name);
            if (!/^[A-Z]([A-Za-z0-9_]){0,254}$/.test(name)) {
                issues.push(createValidationIssue({
                    code: 'questionnaire-invariant-que-0',
                    path: basePath,
                    resourceType: 'Questionnaire',
                    customMessage:
                        "Constraint failed: que-0: 'Name should be usable as an " +
                        "identifier for the module by machine processing " +
                        "applications such as code generation'",
                    severityOverride: 'warning',
                }));
            }
        }

        if (questionnaire.item && Array.isArray(questionnaire.item)) {
            const linkIdSet = new Set<string>();
            issues.push(...validateQuestionnaireItems(
                questionnaire.item,
                linkIdSet,
                `${basePath}.item`,
                fhirVersion,
            ));
        }

        return issues;
    }

    validateQuestionnaireResponse(
        response: any,
        questionnaire?: any,
        options: QuestionnaireValidationOptions = {},
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (response?.resourceType !== 'QuestionnaireResponse') {
            return issues;
        }

        logger.debug('[QuestionnaireValidator] Validating QuestionnaireResponse');

        if (!response.status) {
            issues.push(createValidationIssue({
                code: 'qr-missing-status',
                path: 'QuestionnaireResponse.status',
                resourceType: 'QuestionnaireResponse',
                customMessage: 'QuestionnaireResponse.status is required',
                severityOverride: 'error',
            }));
        }

        if (!questionnaire) {
            if (options.warnOnUnresolvedQuestionnaireReference && typeof response.questionnaire === 'string' && response.questionnaire.trim()) {
                const canonical = response.questionnaire.split('|')[0];
                const wrongType = valueSetCache.getValueSetFile(canonical) ??
                    valueSetCache.getCodeSystemFile(canonical);
                const explicitCanonicalType = canonical.match(
                    /\/(ValueSet|CodeSystem|StructureDefinition|ConceptMap|Library|PlanDefinition|ActivityDefinition)\//,
                )?.[1];
                const wrongResourceType = wrongType?.resourceType ?? explicitCanonicalType;
                if (wrongResourceType) {
                    issues.push(createValidationIssue({
                        code: 'questionnaire-reference-wrong-type',
                        path: 'QuestionnaireResponse.questionnaire',
                        resourceType: 'QuestionnaireResponse',
                        customMessage:
                            `Canonical URL '${response.questionnaire}' refers to a resource that has the wrong type. ` +
                            `Found ${wrongResourceType} expecting Questionnaire`,
                        severityOverride: 'error',
                    }));
                }
                issues.push(createValidationIssue({
                    code: 'questionnaire-reference-not-resolved',
                    path: 'QuestionnaireResponse.questionnaire',
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `Questionnaire '${response.questionnaire}' could not be resolved; QuestionnaireResponse items were not validated against the questionnaire definition.`,
                    severityOverride: 'warning',
                    details: {
                        questionnaire: response.questionnaire,
                    },
                }));
            }

            if (response.item && Array.isArray(response.item)) {
                issues.push(...this.validateResponseItemsBasic(response.item, 'QuestionnaireResponse.item'));
            }
            return issues;
        }

        const questionMap = new Map<string, QuestionnaireItem>();
        this.buildQuestionMap(questionnaire.item || [], questionMap);

        const answerMap = new Map<string, QuestionnaireResponseAnswer[]>();
        buildQuestionnaireAnswerMap(response.item || [], answerMap);

        if (response.item && Array.isArray(response.item)) {
            issues.push(...this.validateResponseItems(
                response.item,
                questionMap,
                'QuestionnaireResponse.item'
            ));
        }

        issues.push(...this.checkRequiredQuestions(response.item || [], questionMap, answerMap));

        if (response.item && Array.isArray(response.item)) {
            issues.push(...validateQuestionnaireSdcConstraints(
                response.item,
                questionMap,
                'QuestionnaireResponse.item'
            ));
        }

        return issues;
    }

    private validateResponseItemsBasic(
        items: QuestionnaireResponseItem[],
        basePath: string
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const path = `${basePath}[${i}]`;

            if (!item.linkId) {
                issues.push(createValidationIssue({
                    code: 'qr-missing-linkid',
                    path: `${path}.linkId`,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: 'Response item must have a linkId',
                    severityOverride: 'error',
                }));
            }

            if (item.item) {
                issues.push(...this.validateResponseItemsBasic(item.item, `${path}.item`));
            }
        }

        return issues;
    }

    private buildQuestionMap(
        items: QuestionnaireItem[],
        map: Map<string, QuestionnaireItem>
    ): void {
        for (const item of items) {
            if (item.linkId) {
                map.set(item.linkId, item);
            }
            if (item.item) {
                this.buildQuestionMap(item.item, map);
            }
        }
    }

    private validateResponseItems(
        items: QuestionnaireResponseItem[],
        questionMap: Map<string, QuestionnaireItem>,
        basePath: string
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const path = `${basePath}[${i}]`;

            if (!item.linkId) continue;

            const question = questionMap.get(item.linkId);
            if (!question) {
                issues.push(createValidationIssue({
                    code: 'not-found',
                    path: `${path}.linkId`,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `LinkId '${item.linkId}' not found in questionnaire`,
                    severityOverride: 'error',
                }));
                continue;
            }

            if (question.type === 'display' && item.answer && item.answer.length > 0) {
                issues.push(createValidationIssue({
                    code: 'structure',
                    path,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `Items of type 'display' cannot have answers`,
                    severityOverride: 'error',
                }));
                continue;
            }

            if (question.type === 'group' && item.answer && item.answer.length > 0) {
                issues.push(createValidationIssue({
                    code: 'structure',
                    path,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `Items of type 'group' cannot have answers, only sub-items`,
                    severityOverride: 'error',
                }));
            }

            if (question.required && question.type !== 'display') {
                if (question.type === 'group') {
                    const hasSubItems = item.item && item.item.length > 0;
                    if (!hasSubItems) {
                        issues.push(createValidationIssue({
                            code: 'qr-required-group',
                            path,
                            resourceType: 'QuestionnaireResponse',
                            customMessage: `No sub-items found for required group`,
                            severityOverride: 'error',
                        }));
                    }
                } else if (!item.answer || item.answer.length === 0) {
                    issues.push(createValidationIssue({
                        code: 'required',
                        path,
                        resourceType: 'QuestionnaireResponse',
                        customMessage: `No response answer found for required item '${item.linkId}'`,
                        severityOverride: 'error',
                    }));
                }
            }

            if (!question.repeats && item.answer && item.answer.length > 1) {
                issues.push(createValidationIssue({
                    code: 'qr-repeats-violation',
                    path,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `Only one response answer item with this linkId allowed`,
                    severityOverride: 'error',
                }));
            }

            if (item.answer) {
                issues.push(...validateQuestionnaireAnswerTypes(item.answer, question, `${path}.answer`));
            }

            if (item.item) {
                issues.push(...this.validateResponseItems(item.item, questionMap, `${path}.item`));
            }
        }

        return issues;
    }

    private checkRequiredQuestions(
        responseItems: QuestionnaireResponseItem[],
        questionMap: Map<string, QuestionnaireItem>,
        answerMap: Map<string, QuestionnaireResponseAnswer[]>
    ): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const presentLinkIds = new Set<string>();

        const collectPresent = (items: QuestionnaireResponseItem[]) => {
            for (const item of items) {
                if (item.linkId) {
                    presentLinkIds.add(item.linkId);
                }
                if (item.item) collectPresent(item.item);
            }
        };
        collectPresent(responseItems);

        for (const [linkId, question] of questionMap) {
            if (!question.required) continue;
            if (presentLinkIds.has(linkId)) continue;
            if (question.type === 'display') continue;

            if (!isQuestionnaireItemEnabled(question, answerMap)) continue;

            if (question.type === 'group') {
                issues.push(createValidationIssue({
                    code: 'qr-required-group',
                    path: `QuestionnaireResponse.item(linkId=${linkId})`,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `No sub-items found for required group`,
                    severityOverride: 'error',
                }));
            } else {
                issues.push(createValidationIssue({
                    code: 'required',
                    path: `QuestionnaireResponse.item(linkId=${linkId})`,
                    resourceType: 'QuestionnaireResponse',
                    customMessage: `No response answer found for required item '${linkId}'`,
                    severityOverride: 'error',
                }));
            }
        }

        return issues;
    }
}

export const questionnaireValidator = new QuestionnaireValidator();
