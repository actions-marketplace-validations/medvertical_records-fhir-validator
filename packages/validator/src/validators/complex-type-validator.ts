import type { ValidationIssue } from '../types';
import { TypeValidator } from './type-validator';
import { ValueSetValidator, type TerminologyResolutionConfig } from './valueset-validator';
import { createValidationIssue } from '../issues';
import type { StructureDefinition, ElementDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { logger } from '../logger';
import {
    isPrimitiveType,
    getNestedValue,
    mergeElementConstraints
} from '../core/executors/structural-executor-helpers';
import { checkExtensionExt1, checkPeriodPer1 } from './complex-type-invariants';
import {
    narrowChoiceTypeElement,
    parentComplexElementAbsent,
    rewriteChoiceTypeBasePath,
    shouldSkipComplexDeepValidation,
} from './complex-type-path-rules';

export class ComplexTypeValidator {
    private valueSetValidator: ValueSetValidator;
    private typeDefinitionCache = new Map<string, Promise<StructureDefinition | null>>();
    private effectiveElementsCache = new Map<string, Promise<Map<string, ElementDefinition> | null>>();

    constructor(
        private sdLoader: StructureDefinitionLoader,
        private typeValidator?: TypeValidator
    ) {
        this.valueSetValidator = new ValueSetValidator();
    }

    configureTerminologyResolution(config: Partial<TerminologyResolutionConfig>): void {
        this.valueSetValidator.setResolutionConfig(config);
    }

    private async loadTypeDefinition(
        typeCode: string,
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
    ): Promise<StructureDefinition | null> {
        const key = `${fhirVersion}|${typeCode}`;
        let promise = this.typeDefinitionCache.get(key);
        if (!promise) {
            promise = this.sdLoader
                .loadProfile(`http://hl7.org/fhir/StructureDefinition/${typeCode}`, fhirVersion)
                .then(sd => sd?.snapshot?.element ? sd : null)
                .catch(error => {
                    logger.debug(`[ComplexTypeValidator] Could not load base StructureDefinition for ${typeCode}:`, error);
                    return null;
                });
            this.typeDefinitionCache.set(key, promise);
        }
        return promise;
    }

    async validateComplexTypeSubElements(
        value: any,
        elementDef: ElementDefinition,
        basePath: string,
        profileUrl: string,
        parentStructureDef?: StructureDefinition,
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
    ): Promise<ValidationIssue[]> {
        const issues: ValidationIssue[] = [];

        try {
            if (!elementDef.type || elementDef.type.length === 0) return issues;

            logger.debug(`[ComplexTypeValidator] Resolving type for ${basePath} from ${elementDef.type?.map(t => t.code).join(', ')}`);
            const primaryType = await this.resolveMatchingType(value, elementDef.type, fhirVersion);
            if (!primaryType) return issues;
            if (isPrimitiveType(primaryType.code)) return issues;
            if (typeof value !== 'object' || value === null) return issues;
            if (shouldSkipComplexDeepValidation(basePath)) return issues;

            basePath = rewriteChoiceTypeBasePath(basePath, primaryType.code);

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    const el = value[i];
                    if (el && typeof el === 'object' && !Array.isArray(el)) {
                        issues.push(...await this.validateComplexTypeSubElements(
                            el, elementDef, `${basePath}[${i}]`, profileUrl, parentStructureDef, fhirVersion
                        ));
                    }
                }
                return issues;
            }

            if (primaryType.code === 'Extension') {
                const ext1Issue = checkExtensionExt1(value, basePath);
                if (ext1Issue) issues.push(ext1Issue);
            }

            if (primaryType.code === 'Period') {
                const per1Issue = checkPeriodPer1(value, basePath);
                if (per1Issue) issues.push(per1Issue);
            }

            const effectiveElements = await this.buildEffectiveElements(
                primaryType.code, basePath, parentStructureDef, fhirVersion
            );
            if (!effectiveElements) return issues;

            for (const [elementPath, subElementDef] of effectiveElements.entries()) {
                if (subElementDef.path === primaryType.code) continue;
                const subIssues = await this.validateSubElement(
                    value, elementPath, subElementDef, primaryType.code,
                    basePath, profileUrl, parentStructureDef, fhirVersion
                );
                issues.push(...subIssues);
            }
        } catch (error) {
            logger.debug(`[ComplexTypeValidator] Error validating complex type sub-elements for ${basePath}:`, error);
        }

        return issues;
    }

    private async buildEffectiveElements(
        typeCode: string,
        basePath: string,
        parentStructureDef?: StructureDefinition,
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
    ): Promise<Map<string, ElementDefinition> | null> {
        const cacheKey = this.getEffectiveElementsCacheKey(typeCode, basePath, parentStructureDef, fhirVersion);
        let promise = this.effectiveElementsCache.get(cacheKey);
        if (!promise) {
            promise = this.buildEffectiveElementsUncached(typeCode, basePath, parentStructureDef, fhirVersion);
            this.effectiveElementsCache.set(cacheKey, promise);
        }
        return promise;
    }

    private async buildEffectiveElementsUncached(
        typeCode: string,
        basePath: string,
        parentStructureDef?: StructureDefinition,
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
    ): Promise<Map<string, ElementDefinition> | null> {
        const baseTypeDef = await this.loadTypeDefinition(typeCode, fhirVersion);

        if (!baseTypeDef?.snapshot?.element) {
            logger.debug(`[ComplexTypeValidator] No base StructureDefinition found for type: ${typeCode}`);
            return null;
        }

        const profileOverrides = this.extractProfileConstraints(typeCode, basePath, parentStructureDef);

        const effective = new Map<string, ElementDefinition>();
        for (const el of baseTypeDef.snapshot.element) {
            effective.set(el.path, { ...el });
        }

        for (const [typePath, profileElement] of profileOverrides.entries()) {
            const base = effective.get(typePath);
            if (base) {
                effective.set(typePath, mergeElementConstraints(base, profileElement));
            } else {
                const relativePath = typePath.substring(typeCode.length + 1);
                if (!relativePath.includes('.')) {
                    effective.set(typePath, { ...profileElement, path: typePath });
                }
            }
        }

        return effective;
    }

    private getEffectiveElementsCacheKey(
        typeCode: string,
        basePath: string,
        parentStructureDef: StructureDefinition | undefined,
        fhirVersion: 'R4' | 'R5' | 'R6',
    ): string {
        const parentKey = [
            parentStructureDef?.url ?? 'base',
            parentStructureDef?.version ?? '',
        ].join('|');
        const normalizedBasePath = basePath.replace(/\[\d+\]/g, '');
        return `${fhirVersion}|${typeCode}|${parentKey}|${normalizedBasePath}`;
    }

    private extractProfileConstraints(
        typeCode: string,
        basePath: string,
        parentStructureDef?: StructureDefinition
    ): Map<string, ElementDefinition> {
        const result = new Map<string, ElementDefinition>();
        if (!parentStructureDef?.snapshot?.element) return result;

        const basePathPrefix = basePath.replace(/\[\d+\]/g, '');
        for (const el of parentStructureDef.snapshot.element) {
            if (el.sliceName) continue;
            if (typeof el.id === 'string' && el.id.includes(':')) continue;

            if (el.path.startsWith(basePathPrefix + '.')) {
                const relativePath = el.path.substring(basePathPrefix.length + 1);
                result.set(`${typeCode}.${relativePath}`, el);
            }
        }
        return result;
    }

    private async validateSubElement(
        value: any,
        elementPath: string,
        subElementDef: ElementDefinition,
        typeCode: string,
        basePath: string,
        profileUrl: string,
        parentStructureDef?: StructureDefinition,
        fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'
    ): Promise<ValidationIssue[]> {
        // Extract relative sub-path
        let subPath: string;
        if (elementPath.startsWith(`${typeCode}.`)) {
            subPath = elementPath.substring(typeCode.length + 1);
        } else {
            subPath = subElementDef.path.replace(`${typeCode}.`, '');
            if (subPath.includes('.')) {
                const prefix = basePath.replace(/\[\d+\]/g, '');
                if (subPath.startsWith(prefix + '.')) {
                    subPath = subPath.substring(prefix.length + 1);
                }
            }
        }

        const fullPath = `${basePath}.${subPath}`;
        const effectiveElementDef = narrowChoiceTypeElement(subPath, value, subElementDef);

        let subValue = getNestedValue(value, subPath);
        if (subValue === undefined && !subPath.includes('.') && value && typeof value === 'object' && subPath in value) {
            subValue = value[subPath];
        }

        const isValueMissing = subValue === undefined || subValue === null ||
            (typeof subValue === 'string' && subValue.trim().length === 0);
        const minCardinality = subElementDef.min ?? 0;

        if (isValueMissing && minCardinality > 0) {
            if (parentComplexElementAbsent(value, subPath)) return [];
            return [createValidationIssue({
                code: 'structural-required-element-missing',
                path: fullPath,
                resourceType: value?.resourceType || 'Unknown',
                profile: profileUrl,
                messageParams: { element: fullPath },
            })];
        } else if (typeof subValue === 'object' && subValue !== null) {
            const declaredTypes = effectiveElementDef.type?.map(t => t.code) || [];
            const allPrimitive = declaredTypes.length > 0 && declaredTypes.every(t => isPrimitiveType(t));
            if (allPrimitive && this.typeValidator) {
                const issues: ValidationIssue[] = [];
                const typeIssues = await this.typeValidator.validate(subValue, effectiveElementDef.type || [], fullPath, profileUrl);
                issues.push(...typeIssues);
                return issues;
            }
            return this.validateComplexTypeSubElements(subValue, effectiveElementDef, fullPath, profileUrl, parentStructureDef, fhirVersion);
        } else if (subValue !== undefined && subValue !== null) {
            const issues: ValidationIssue[] = [];

            if (effectiveElementDef.binding && effectiveElementDef.binding.strength === 'required') {
                try {
                    const bindingIssues = await this.valueSetValidator.validateBinding(
                        subValue,
                        subElementDef.binding,
                        fullPath,
                        { profileUrl, fhirVersion }
                    );
                    issues.push(...bindingIssues);
                } catch (err) {
                    logger.debug(`[ComplexTypeValidator] binding check failed for ${fullPath}:`, err);
                }
            }

            if (this.typeValidator) {
                const typeIssues = await this.typeValidator.validate(subValue, effectiveElementDef.type || [], fullPath, profileUrl);
                issues.push(...typeIssues);
            }
            return issues;
        }
        return [];
    }

    private async resolveMatchingType(value: any, types: ElementDefinition['type'], fhirVersion: 'R4' | 'R5' | 'R6' = 'R4'): Promise<{ code: string } | undefined> {
        if (!types || types.length === 0) return undefined;
        if (types.length === 1) return types[0];

        const complexCandidates = types.filter(t => !isPrimitiveType(t.code));

        if (complexCandidates.length === 0) return types[0];
        if (complexCandidates.length === 1) return complexCandidates[0];

        const valueKeys = Object.keys(value);
        if (valueKeys.length === 0) return complexCandidates[0];

        let bestMatch = complexCandidates[0];
        let maxMatches = -1;

        for (const type of complexCandidates) {
            try {
                const def = await this.loadTypeDefinition(type.code, fhirVersion);
                if (!def?.snapshot?.element) continue;

                const validKeys = new Set(def.snapshot.element
                    .filter(e => {
                        const parts = e.path.split('.');
                        return parts.length === 2 && parts[0] === type.code;
                    })
                    .map(e => e.path.split('.')[1]));

                const matchCount = valueKeys.filter(k => validKeys.has(k)).length;

                logger.debug(`[ComplexTypeValidator] Type candidate ${type.code}: matched ${matchCount} keys (${valueKeys.filter(k => validKeys.has(k)).join(',')})`);

                if (matchCount > maxMatches) {
                    maxMatches = matchCount;
                    bestMatch = type;
                }
            } catch {
            }
        }

        logger.debug(`[ComplexTypeValidator] Resolved ${types.map(t => t.code).join('|')} -> ${bestMatch.code}`);
        return bestMatch;
    }
}
