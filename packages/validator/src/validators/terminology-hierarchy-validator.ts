import axios from 'axios';
import { logger } from '../logger';

export interface SubsumptionResult {
    /**
     * Relationship outcome. `'unknown'` is returned when the terminology
     * server could not be reached — callers MUST check `checkable` before
     * treating `'not-subsumed'` as authoritative.
     */
    outcome: 'subsumes' | 'subsumed-by' | 'equivalent' | 'not-subsumed' | 'unknown';
    related: boolean;
    /**
     * Whether this result is authoritative. `false` when the terminology
     * server returned an error or was unreachable — `outcome` will be
     * `'unknown'` in that case and `error` will carry the reason.
     */
    checkable: boolean;
    error?: string;
}

export interface HierarchyInfo {
    code: string;
    system: string;
    display?: string;
    parents?: string[];
    children?: string[];
    ancestors?: string[];
    descendants?: string[];
}

export interface HierarchyValidationResult {
    /**
     * True if the code belongs to the required hierarchy.
     *
     * When `checkable === false` this field is meaningless and should be
     * treated as "unverified" rather than "invalid" — the validator could
     * not reach the terminology server to make the determination. Without
     * this distinction the validator produces false negatives during
     * tx.fhir.org outages.
     */
    isValid: boolean;
    /**
     * Whether the underlying subsumption check was authoritative.
     * `false` means the terminology server was unreachable or returned
     * an error; callers should degrade gracefully instead of failing
     * validation.
     */
    checkable: boolean;
    message?: string;
    hierarchyInfo?: HierarchyInfo;
}

const SNOMED_CT_URL = 'http://snomed.info/sct';
const ICD10_CM_URL = 'http://hl7.org/fhir/sid/icd-10-cm';
const _ICD10_WHO_URL = 'http://hl7.org/fhir/sid/icd-10';
const _LOINC_URL = 'http://loinc.org';
const DEFAULT_TX_SERVER = 'https://tx.fhir.org/r4';

export class TerminologyHierarchyValidator {
    private serverUrl: string;
    private timeout: number;
    private subsumptionCache: Map<string, SubsumptionResult> = new Map();
    private hierarchyCache: Map<string, HierarchyInfo> = new Map();

    constructor(options?: { serverUrl?: string; timeout?: number }) {
        this.serverUrl = options?.serverUrl || DEFAULT_TX_SERVER;
        this.timeout = options?.timeout || 5000;
    }

    setServerUrl(url: string): void {
        this.serverUrl = url;
        this.subsumptionCache.clear();
        this.hierarchyCache.clear();
    }

    async checkSnomedSubsumption(
        codeA: string,
        codeB: string
    ): Promise<SubsumptionResult> {
        const cacheKey = `${SNOMED_CT_URL}|${codeA}|${codeB}`;

        if (this.subsumptionCache.has(cacheKey)) {
            return this.subsumptionCache.get(cacheKey)!;
        }

        try {
            const params = {
                system: SNOMED_CT_URL,
                codeA,
                codeB,
                _format: 'json'
            };

            logger.debug(`[HierarchyValidator] Checking SNOMED subsumption: ${codeA} → ${codeB}`);

            const response = await axios.get(`${this.serverUrl}/CodeSystem/$subsumes`, {
                params,
                timeout: this.timeout,
                headers: { 'Accept': 'application/fhir+json' }
            });

            const parameters = response.data;
            if (parameters.resourceType === 'Parameters') {
                const outcomeParam = parameters.parameter?.find((p: any) => p.name === 'outcome');
                const outcome = outcomeParam?.valueCode as SubsumptionResult['outcome'] || 'not-subsumed';

                const result: SubsumptionResult = {
                    outcome,
                    related: outcome !== 'not-subsumed',
                    checkable: true,
                };

                this.subsumptionCache.set(cacheKey, result);
                logger.debug(`[HierarchyValidator] SNOMED subsumption result: ${outcome}`);
                return result;
            }

            return { outcome: 'unknown', related: false, checkable: false };

        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            const errorMsg = err.message || 'Unknown error';
            logger.warn(`[HierarchyValidator] SNOMED subsumption check failed: ${errorMsg}`);
            return {
                outcome: 'unknown',
                related: false,
                checkable: false,
                error: errorMsg,
            };
        }
    }

    async isSnomedDescendantOf(
        code: string,
        ancestorCode: string
    ): Promise<boolean | 'unknown'> {
        const result = await this.checkSnomedSubsumption(ancestorCode, code);
        if (!result.checkable) return 'unknown';
        return result.outcome === 'subsumes' || result.outcome === 'equivalent';
    }

    async validateSnomedHierarchy(
        code: string,
        requiredAncestor: string,
        ancestorName?: string
    ): Promise<HierarchyValidationResult> {
        const result = await this.checkSnomedSubsumption(requiredAncestor, code);

        if (!result.checkable) {
            const ancestorDesc = ancestorName || requiredAncestor;
            return {
                isValid: false,
                checkable: false,
                message:
                    `Could not verify SNOMED hierarchy for '${code}' against ` +
                    `'${ancestorDesc}' (${requiredAncestor}): ${result.error ?? 'terminology server unavailable'}`,
            };
        }

        const isDescendant =
            result.outcome === 'subsumes' || result.outcome === 'equivalent';
        if (isDescendant) {
            return { isValid: true, checkable: true };
        }

        const ancestorDesc = ancestorName || requiredAncestor;
        return {
            isValid: false,
            checkable: true,
            message: `SNOMED code '${code}' is not a type of '${ancestorDesc}' (${requiredAncestor})`,
        };
    }

    async validateIcd10Hierarchy(
        code: string,
        options?: {
            allowBillable?: boolean;
            requiredCategory?: string;
        }
    ): Promise<HierarchyValidationResult> {
        const icd10Pattern = /^[A-TV-Z]\d{2}(\.\d{1,4})?$/i;
        if (!icd10Pattern.test(code)) {
            return {
                isValid: false,
                checkable: true,
                message: `Invalid ICD-10 code format: '${code}'`
            };
        }

        const category = code.substring(0, 3).toUpperCase();

        if (options?.requiredCategory) {
            const categoryMatch = this.icd10CategoryMatch(category, options.requiredCategory);
            if (!categoryMatch) {
                return {
                    isValid: false,
                    checkable: true,
                    message: `ICD-10 code '${code}' is not in required category '${options.requiredCategory}'`
                };
            }
        }

        if (options?.allowBillable === false && code.includes('.')) {
            return {
                isValid: false,
                checkable: true,
                message: `ICD-10 code '${code}' should be a category code, not a billable code`
            };
        }

        if (options?.allowBillable === true && !code.includes('.')) {
            return {
                isValid: false,
                checkable: true,
                message: `ICD-10 code '${code}' should be a billable (specific) code with decimal`
            };
        }

        return {
            isValid: true,
            checkable: true,
            hierarchyInfo: {
                code,
                system: ICD10_CM_URL,
                parents: [category]
            }
        };
    }

    private icd10CategoryMatch(category: string, range: string): boolean {
        const rangeMatch = range.match(/^([A-Z]\d{2})-([A-Z]\d{2})$/i);
        if (rangeMatch) {
            const [, start, end] = rangeMatch;
            return category >= start.toUpperCase() && category <= end.toUpperCase();
        }

        return category.toUpperCase() === range.toUpperCase();
    }

    async getHierarchyInfo(
        code: string,
        system: string
    ): Promise<HierarchyInfo | null> {
        const cacheKey = `${system}|${code}`;

        if (this.hierarchyCache.has(cacheKey)) {
            return this.hierarchyCache.get(cacheKey)!;
        }

        try {
            const params = {
                system,
                code,
                property: 'parent,child',
                _format: 'json'
            };

            const response = await axios.get(`${this.serverUrl}/CodeSystem/$lookup`, {
                params,
                timeout: this.timeout,
                headers: { 'Accept': 'application/fhir+json' }
            });

            const parameters = response.data;
            if (parameters.resourceType === 'Parameters') {
                const info: HierarchyInfo = { code, system };

                const displayParam = parameters.parameter?.find((p: any) => p.name === 'display');
                if (displayParam?.valueString) {
                    info.display = displayParam.valueString;
                }

                const parentParams = parameters.parameter?.filter(
                    (p: any) => p.name === 'property' && p.part?.some((pp: any) => pp.name === 'code' && pp.valueCode === 'parent')
                );
                if (parentParams?.length > 0) {
                    info.parents = parentParams.map((p: any) =>
                        p.part?.find((pp: any) => pp.name === 'value')?.valueCode
                    ).filter(Boolean);
                }

                const childParams = parameters.parameter?.filter(
                    (p: any) => p.name === 'property' && p.part?.some((pp: any) => pp.name === 'code' && pp.valueCode === 'child')
                );
                if (childParams?.length > 0) {
                    info.children = childParams.map((p: any) =>
                        p.part?.find((pp: any) => pp.name === 'value')?.valueCode
                    ).filter(Boolean);
                }

                this.hierarchyCache.set(cacheKey, info);
                return info;
            }

            return null;

        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn(`[HierarchyValidator] Hierarchy lookup failed: ${err.message}`);
            return null;
        }
    }

    getCacheStats(): { subsumption: number; hierarchy: number } {
        return {
            subsumption: this.subsumptionCache.size,
            hierarchy: this.hierarchyCache.size
        };
    }

    clearCaches(): void {
        this.subsumptionCache.clear();
        this.hierarchyCache.clear();
    }
}

let hierarchyValidatorInstance: TerminologyHierarchyValidator | null = null;

export function getHierarchyValidator(): TerminologyHierarchyValidator {
    if (!hierarchyValidatorInstance) {
        hierarchyValidatorInstance = new TerminologyHierarchyValidator();
    }
    return hierarchyValidatorInstance;
}

export function resetHierarchyValidator(): void {
    hierarchyValidatorInstance = null;
}
