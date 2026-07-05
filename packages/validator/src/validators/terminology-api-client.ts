/**
 * Terminology API Client
 * 
 * HTTP client for terminology server operations ($expand, $validate-code).
 * Extracted from valueset-validator.ts for modularity.
 */

import axios, { isAxiosError } from 'axios';
import type { TerminologyResolutionConfig, TerminologyServerOverride } from './valueset-types';
import { ValueSetCache, valueSetCache } from './valueset-cache';
import { logger } from '../logger';
import { CircuitBreaker } from '../terminology';
import type { CodeSystemValidationResult, SubsumptionOutcome } from './terminology-api-types';
import {
    clearCodeSystemValidateCodeCache,
    getFromCodeSystemValidateCodeCache,
    getFromSubsumesCache,
    getFromValidateCodeCache,
    getFromValueSetNotResolvableCache,
    makeCodeSystemValidateCodeCacheKey,
    makeSubsumesCacheKey,
    makeValidateCodeCacheKey,
    makeValueSetNotResolvableCacheKey,
    storeInCodeSystemValidateCodeCache,
    storeInSubsumesCache,
    storeInValidateCodeCache,
    storeInValueSetNotResolvableCache,
} from './terminology-api-cache';
import {
    isSnomedNationalExtensionSystemCode,
    operationOutcomeToCodeSystemResult,
    parseCodeSystemValidationParameters,
} from './terminology-code-system-result';
import {
    extractSubsumptionOutcome,
    operationOutcomeCannotResolveBinding,
    validateCodeSucceeded,
} from './terminology-parameters';
import { runSingleFlight } from './terminology-pending-requests';
import { TerminologyRequestConfigBuilder } from './terminology-api-request-config';
import {
    DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS,
    DEFAULT_VALUESET_EXPAND_TIMEOUT_MS,
    getRemoteTerminologyTimeoutMs,
    recordTerminologyResponse,
} from './terminology-api-remote-policy';
import { RemoteCodeSystemValidationBudget } from './terminology-api-remote-budget';

export type {
    CodeSystemValidationIssue,
    CodeSystemValidationResult,
    SubsumptionOutcome,
} from './terminology-api-types';
export {
    clearSubsumesCache,
    clearCodeSystemValidateCodeCache,
    clearValidateCodeCache,
    getCachedSubsumesOutcome,
    getSubsumesCacheSize,
    getValidateCodeCacheSize,
} from './terminology-api-cache';
export { isSnomedNationalExtensionCode } from './terminology-code-system-result';

// Shared circuit breaker for CodeSystem validation (fail fast when tx.fhir.org is down)
const codeSystemCircuitBreaker = new CircuitBreaker('codesystem-validation', {
    failureThreshold: 3,    // Open after 3 failures
    resetTimeout: 30000,    // Try again after 30 seconds
    successThreshold: 1,    // Close after 1 success
});
const valueSetValidateCodeCircuitBreakers = new Map<string, CircuitBreaker>();
const valueSetExpansionCircuitBreakers = new Map<string, CircuitBreaker>();
const subsumesCircuitBreakers = new Map<string, CircuitBreaker>();
const pendingValidateCodeRequests = new Map<string, Promise<boolean>>();
const pendingSubsumesRequests = new Map<string, Promise<SubsumptionOutcome>>();
const pendingCodeSystemValidateCodeRequests = new Map<string, Promise<CodeSystemValidationResult>>();

function getServerCircuitBreaker(
    breakers: Map<string, CircuitBreaker>,
    operation: string,
    serverUrl: string,
): CircuitBreaker {
    const existing = breakers.get(serverUrl);
    if (existing) return existing;

    const breaker = new CircuitBreaker(`${operation}:${serverUrl}`, {
        failureThreshold: 3,
        resetTimeout: 30000,
        successThreshold: 1,
    });
    breakers.set(serverUrl, breaker);
    return breaker;
}

function isTransientTerminologyFailure(error: unknown): boolean {
    const axiosResp = isAxiosError(error) ? error.response : undefined;
    if (!axiosResp) return true;
    return axiosResp.status >= 500;
}

// ============================================================================
// Terminology API Client
// ============================================================================

export class TerminologyApiClient {
    private readonly requestConfigBuilder = new TerminologyRequestConfigBuilder(() => this.config.auth);
    private readonly remoteCodeSystemBudget = new RemoteCodeSystemValidationBudget();

    constructor(
        private config: TerminologyResolutionConfig,
        private cache: ValueSetCache = valueSetCache
    ) { }

    /**
     * Update the configuration. Also invalidates the cached OAuth2
     * token so a changed auth config takes effect on the next call.
     */
    setConfig(config: TerminologyResolutionConfig): void {
        const authChanged =
            JSON.stringify(this.config.auth) !== JSON.stringify(config.auth);
        this.config = config;
        if (authChanged) this.requestConfigBuilder.resetAuthCache();
        this.remoteCodeSystemBudget.reset();
    }

    /**
     * Expand a ValueSet using a remote terminology server ($expand operation)
     * Returns null if server is unavailable or expansion fails
     */
    async expandValueSet(valueSetUrl: string, override?: TerminologyServerOverride): Promise<Set<string> | null> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) {
            return null;
        }

        // Check server expansion cache with TTL
        const ttlSeconds = this.config.serverDelegation?.cacheTTLSeconds ?? 3600;
        const cacheKey = `${serverUrl}|${valueSetUrl}`;
        const cached = this.cache.getServerExpansion(cacheKey, ttlSeconds);
        if (cached) {
            return cached;
        }

        const circuitBreaker = getServerCircuitBreaker(valueSetExpansionCircuitBreakers, 'valueset-expand', serverUrl);
        if (!(await circuitBreaker.allowRequest())) {
            logger.debug(`[TerminologyApiClient] $expand circuit open for ${serverUrl}; skipping ${valueSetUrl}`);
            return null;
        }

        try {
            const startedAt = Date.now();
            const response = await axios.get(`${serverUrl}/ValueSet/$expand`, {
                ...(await this.requestConfigBuilder.build(override?.auth, getRemoteTerminologyTimeoutMs(this.config, DEFAULT_VALUESET_EXPAND_TIMEOUT_MS), {
                    url: valueSetUrl,
                    _format: 'json'
                })),
            });

            if (response.data?.expansion?.contains) {
                const codes = new Set<string>();
                for (const item of response.data.expansion.contains) {
                    if (item.code) {
                        // Add both bare code and system|code format
                        codes.add(item.code);
                        if (item.system) {
                            codes.add(`${item.system}|${item.code}`);
                        }
                    }
                }

                // Cache the result
                if (this.config.serverDelegation?.cacheResults !== false) {
                    this.cache.setServerExpansion(cacheKey, codes);
                }

                logger.debug(`[TerminologyApiClient] Server $expand succeeded: ${valueSetUrl}, ${codes.size} codes`);
                recordTerminologyResponse(circuitBreaker, this.config, '$expand', serverUrl, startedAt);
                return codes;
            }

            recordTerminologyResponse(circuitBreaker, this.config, '$expand', serverUrl, startedAt);
            return null;
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (isTransientTerminologyFailure(error)) {
                circuitBreaker.recordFailure();
            } else {
                circuitBreaker.recordSuccess();
            }
            logger.debug(`[TerminologyApiClient] Server $expand failed for ${valueSetUrl}: ${err.message}`);
            return null;
        }
    }

    /**
     * Validate a code against a ValueSet using $validate-code
     * @param bindingStrength - If 'required', fail closed on server errors (422/404)
     */
    async validateCode(
        code: string,
        system: string | undefined,
        valueSetUrl: string,
        bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example',
        override?: TerminologyServerOverride,
    ): Promise<boolean> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) return false;

        const valueSetNotResolvableKey = makeValueSetNotResolvableCacheKey(serverUrl, valueSetUrl);
        if (getFromValueSetNotResolvableCache(valueSetNotResolvableKey)) {
            logger.debug(`[TerminologyApiClient] validate-code ValueSet not-resolvable cache HIT: ${valueSetUrl}`);
            return true;
        }

        // Short-circuit: identical (server,system,code,valueSet) lookups
        // are extremely common in bulk runs. The tx server would answer
        // the same way every time within the TTL window.
        const cacheKey = makeValidateCodeCacheKey(serverUrl, system, code, valueSetUrl);
        const cached = getFromValidateCodeCache(cacheKey);
        if (cached !== undefined) {
            logger.debug(`[TerminologyApiClient] validate-code cache HIT: ${code} in ${valueSetUrl} → ${cached}`);
            return cached;
        }

        return runSingleFlight(
            pendingValidateCodeRequests,
            cacheKey,
            () => logger.debug(`[TerminologyApiClient] validate-code in-flight HIT: ${code} in ${valueSetUrl}`),
            async () => {
                const circuitBreaker = getServerCircuitBreaker(valueSetValidateCodeCircuitBreakers, 'valueset-validate-code', serverUrl);
                if (!(await circuitBreaker.allowRequest())) {
                    logger.debug(`[TerminologyApiClient] $validate-code circuit open for ${serverUrl}; skipping ${code} in ${valueSetUrl}`);
                    return false;
                }
                return this.executeValidateCodeRequest(cacheKey, code, system, valueSetUrl, bindingStrength, override);
            },
        );
    }

    /**
     * Validate a code directly against a CodeSystem using tx.fhir.org $validate-code
     * Used for large external CodeSystems like LOINC and SNOMED
     * 
     * Uses circuit breaker to prevent flooding failing servers with requests.
     */
    async validateCodeInCodeSystem(
        code: string,
        system: string,
        display?: string,
        override?: TerminologyServerOverride,
    ): Promise<CodeSystemValidationResult> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) {
            const message = `No terminology server configured for CodeSystem '${system}'`;
            logger.debug(`[TerminologyApiClient] ${message}; skipping direct CodeSystem validation`);
            return { valid: true };
        }

        const cacheKey = makeCodeSystemValidateCodeCacheKey(serverUrl, system, code, display);
        const cached = getFromCodeSystemValidateCodeCache<CodeSystemValidationResult>(cacheKey);
        if (cached) {
            logger.debug(`[TerminologyApiClient] CodeSystem validate-code cache HIT: ${system}|${code}`);
            return cached;
        }

        return runSingleFlight(
            pendingCodeSystemValidateCodeRequests,
            cacheKey,
            () => logger.debug(`[TerminologyApiClient] CodeSystem validate-code in-flight HIT: ${system}|${code}`),
            async () => {
                // Circuit breaker: fail fast if server is down
                if (codeSystemCircuitBreaker.isOpen()) {
                    logger.debug(`[TerminologyApiClient] Circuit breaker OPEN, skipping CodeSystem validation for ${system}`);
                    return { valid: true }; // Fail open when server unavailable
                }

                if (!this.remoteCodeSystemBudget.reserve(serverUrl, this.config)) {
                    return {
                        valid: true,
                        reason: 'remote-budget-exhausted',
                        message:
                            `Remote CodeSystem validation budget exhausted for ${serverUrl}; ` +
                            `code/display was not verified remotely.`,
                    };
                }

                return this.executeCodeSystemValidateCodeRequest(cacheKey, serverUrl, code, system, display, override);
            },
        );
    }

    private async executeCodeSystemValidateCodeRequest(
        cacheKey: string,
        serverUrl: string,
        code: string,
        system: string,
        display?: string,
        override?: TerminologyServerOverride,
    ): Promise<CodeSystemValidationResult> {
        try {
            const params = {
                url: system,
                code: code,
                ...(display ? { display } : {}),
                _format: 'json'
            };

            logger.debug(`[TerminologyApiClient] Validating code '${code}' in CodeSystem ${system} via ${serverUrl}`);

            const startedAt = Date.now();
            const response = await axios.get(`${serverUrl}/CodeSystem/$validate-code`, {
                ...(await this.requestConfigBuilder.build(override?.auth, getRemoteTerminologyTimeoutMs(this.config, DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS), params)),
            });

            recordTerminologyResponse(codeSystemCircuitBreaker, this.config, 'CodeSystem/$validate-code', serverUrl, startedAt);
            const result = parseCodeSystemValidationParameters(response.data, code, system);
            storeInCodeSystemValidateCodeCache(cacheKey, result);
            return result;
        } catch (error: unknown) {
            const result = this.handleCodeSystemValidationError(error, code, system);
            const axiosResp = isAxiosError(error) ? error.response : undefined;
            if (axiosResp?.status === 422 || axiosResp?.status === 404) {
                storeInCodeSystemValidateCodeCache(cacheKey, result);
            }
            return result;
        }
    }

    private handleCodeSystemValidationError(
        error: unknown,
        code: string,
        system: string,
    ): CodeSystemValidationResult {
        const err = error instanceof Error ? error : new Error(String(error));
        const axiosResp = isAxiosError(error) ? error.response : undefined;

        if (axiosResp?.status === 422 || axiosResp?.status === 404) {
            codeSystemCircuitBreaker.recordSuccess();
            if (isSnomedNationalExtensionSystemCode(system, code)) {
                logger.debug(`[TerminologyApiClient] Code '${code}' is a SNOMED national-extension SCTID — failing open (server returned ${axiosResp.status})`);
                return { valid: true };
            }
            return operationOutcomeToCodeSystemResult(axiosResp.data, code, system);
        }

        codeSystemCircuitBreaker.recordFailure();
        logger.warn(`[TerminologyApiClient] CodeSystem validation failed for ${system}: ${err.message}`);
        return { valid: true };
    }

    /**
     * Ask the terminology server whether codeA subsumes codeB in a CodeSystem.
     * Used as a targeted fallback for filtered ValueSets such as
     * `concept is-a <snomed-code>` when a local CodeSystem tree is unavailable.
     */
    async subsumes(
        system: string,
        codeA: string,
        codeB: string,
        override?: TerminologyServerOverride,
    ): Promise<SubsumptionOutcome> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) return 'unknown';

        const cacheKey = makeSubsumesCacheKey(serverUrl, system, codeA, codeB);
        const cached = getFromSubsumesCache(cacheKey);
        if (cached !== undefined) {
            logger.debug(`[TerminologyApiClient] $subsumes cache HIT: ${system}|${codeA} → ${codeB} = ${cached}`);
            return cached;
        }

        return runSingleFlight(
            pendingSubsumesRequests,
            cacheKey,
            () => logger.debug(`[TerminologyApiClient] $subsumes in-flight HIT: ${system}|${codeA} → ${codeB}`),
            async () => {
                const circuitBreaker = getServerCircuitBreaker(subsumesCircuitBreakers, 'subsumes', serverUrl);
                if (!(await circuitBreaker.allowRequest())) {
                    logger.debug(`[TerminologyApiClient] $subsumes circuit open for ${serverUrl}; skipping ${system}|${codeA} -> ${codeB}`);
                    return 'unknown';
                }
                return this.executeSubsumesRequest(cacheKey, system, codeA, codeB, override);
            },
        );
    }

    private async executeValidateCodeRequest(
        cacheKey: string,
        code: string,
        system: string | undefined,
        valueSetUrl: string,
        bindingStrength?: 'required' | 'extensible' | 'preferred' | 'example',
        override?: TerminologyServerOverride,
    ): Promise<boolean> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) return false;
        const circuitBreaker = getServerCircuitBreaker(valueSetValidateCodeCircuitBreakers, 'valueset-validate-code', serverUrl);
        try {
            const params: Record<string, string> = {
                url: valueSetUrl,
                code: code,
                _format: 'json'
            };
            if (system) {
                params.system = system;
            }

            const startedAt = Date.now();
            const response = await axios.get(`${serverUrl}/ValueSet/$validate-code`, {
                ...(await this.requestConfigBuilder.build(override?.auth, getRemoteTerminologyTimeoutMs(this.config, DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS), params)),
            });

            if (validateCodeSucceeded(response.data)) {
                logger.debug(`[TerminologyApiClient] Server $validate-code CONFIRMED ${code} in ${valueSetUrl}`);
                recordTerminologyResponse(circuitBreaker, this.config, 'ValueSet/$validate-code', serverUrl, startedAt);
                storeInValidateCodeCache(cacheKey, true);
                return true;
            }

            recordTerminologyResponse(circuitBreaker, this.config, 'ValueSet/$validate-code', serverUrl, startedAt);
            storeInValidateCodeCache(cacheKey, false);
            return false;
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            const axiosResp = isAxiosError(error) ? error.response : undefined;
            if (axiosResp?.data) {
                logger.debug(`[TerminologyApiClient] Server $validate-code failed with data: ${JSON.stringify(axiosResp.data)}`);
            } else {
                logger.debug(`[TerminologyApiClient] Server $validate-code failed: ${err.message}`);
            }

            if (axiosResp?.status === 422 || axiosResp?.status === 404) {
                circuitBreaker.recordSuccess();
                const cantResolve = operationOutcomeCannotResolveBinding(axiosResp.data);
                if (cantResolve || bindingStrength !== 'required') {
                    logger.warn(`[TerminologyApiClient] Server returned ${axiosResp.status} (${cantResolve ? 'not-resolvable' : 'non-required binding'}). Failing open (assuming valid).`);
                    if (cantResolve) {
                        storeInValueSetNotResolvableCache(makeValueSetNotResolvableCacheKey(serverUrl, valueSetUrl));
                    }
                    storeInValidateCodeCache(cacheKey, true);
                    return true;
                }
                logger.warn(`[TerminologyApiClient] Server returned ${axiosResp.status} for required binding validation. Failing closed.`);
                storeInValidateCodeCache(cacheKey, false);
                return false;
            }

            // Network / timeout / 5xx — don't cache, may be transient.
            circuitBreaker.recordFailure();
            return false;
        }
    }

    private async executeSubsumesRequest(
        cacheKey: string,
        system: string,
        codeA: string,
        codeB: string,
        override?: TerminologyServerOverride,
    ): Promise<SubsumptionOutcome> {
        const serverUrl = override?.url ?? this.config.serverUrl;
        if (!serverUrl) return 'unknown';
        const circuitBreaker = getServerCircuitBreaker(subsumesCircuitBreakers, 'subsumes', serverUrl);
        try {
            const startedAt = Date.now();
            const response = await axios.get(`${serverUrl}/CodeSystem/$subsumes`, {
                ...(await this.requestConfigBuilder.build(override?.auth, getRemoteTerminologyTimeoutMs(this.config, DEFAULT_REMOTE_TERMINOLOGY_TIMEOUT_MS), {
                    system,
                    codeA,
                    codeB,
                    _format: 'json',
                })),
            });

            const outcome = extractSubsumptionOutcome(response.data);
            if (outcome) {
                recordTerminologyResponse(circuitBreaker, this.config, 'CodeSystem/$subsumes', serverUrl, startedAt);
                storeInSubsumesCache(cacheKey, outcome);
                return outcome;
            }
            recordTerminologyResponse(circuitBreaker, this.config, 'CodeSystem/$subsumes', serverUrl, startedAt);
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (isTransientTerminologyFailure(error)) {
                circuitBreaker.recordFailure();
            } else {
                circuitBreaker.recordSuccess();
            }
            logger.debug(`[TerminologyApiClient] Server $subsumes failed for ${system}|${codeA} -> ${codeB}: ${err.message}`);
        }

        return 'unknown';
    }

    /**
     * Convenience: returns true when `child` is `codeB` and `parent` is
     * `codeA` and the server reports `subsumes` or `equivalent`. The
     * terminology server's argument order (codeA subsumes codeB) is easy
     * to reverse — this helper makes the intent at the call site obvious.
     */
    async isSubsumedBy(
        system: string,
        child: string,
        parent: string,
        override?: TerminologyServerOverride,
    ): Promise<boolean> {
        const outcome = await this.subsumes(system, parent, child, override);
        return outcome === 'subsumes' || outcome === 'equivalent';
    }
}
