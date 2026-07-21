import type {
    CodeSystem,
    ValueSet,
    ValueSetComposeExclude,
    ValueSetComposeInclude,
} from './valueset-types';
import { logger } from '../logger';
import { applyConceptFilter, extractCodesFromCodeSystem } from './valueset-concept-utils';
import type { FhirVersion } from './valueset-package-utils';

export interface ValueSetConceptFilter {
    system: string;
    property: string;
    op: string;
    value: string;
    version?: string;
}

interface ValueSetExpansionResolver {
    loadValueSetResource(valueSetUrl: string, fhirVersion?: FhirVersion): Promise<ValueSet | null>;
    loadCodeSystem(
        systemUrl: string,
        preferredFhirMajor?: string,
        requestedVersion?: string,
    ): Promise<CodeSystem | null>;
}

interface ValueSetExpansionEntry {
    system?: string;
    code?: string;
    contains?: ValueSetExpansionEntry[];
}

const MAX_COMPOSITION_DEPTH = 20;

export async function collectCodesFromValueSet(
    valueSet: ValueSet,
    resolver: ValueSetExpansionResolver,
    visited: Set<string>,
    depth: number,
    preferredFhirMajor?: string,
): Promise<string[]> {
    if (depth >= MAX_COMPOSITION_DEPTH) {
        logger.warn(
            `[ValueSetPackageLoader] Composition depth limit (${MAX_COMPOSITION_DEPTH}) reached at ` +
            `${valueSet.url ?? '<anonymous>'} — stopping recursion`,
        );
        return [];
    }
    if (valueSet.url && visited.has(valueSet.url)) {
        logger.warn(`[ValueSetPackageLoader] Cycle detected at ${valueSet.url} — skipping`);
        return [];
    }
    if (valueSet.url) visited.add(valueSet.url);

    const accumulator = new Set<string>();
    flattenExpansion(valueSet.expansion?.contains).forEach(code => accumulator.add(code));

    for (const include of valueSet.compose?.include ?? []) {
        const included = await resolveIncludeOrExclude(include, resolver, visited, depth, preferredFhirMajor);
        included.forEach(code => accumulator.add(code));
    }

    for (const exclude of valueSet.compose?.exclude ?? []) {
        const excluded = await resolveIncludeOrExclude(exclude, resolver, visited, depth, preferredFhirMajor);
        excluded.forEach(code => accumulator.delete(code));
    }

    return Array.from(accumulator);
}

export async function collectIncludeConceptFilters(
    valueSet: ValueSet,
    resolver: ValueSetExpansionResolver,
    visited: Set<string>,
    depth: number,
    preferredFhirMajor?: string,
): Promise<ValueSetConceptFilter[]> {
    if (depth >= MAX_COMPOSITION_DEPTH) return [];
    if (valueSet.url && visited.has(valueSet.url)) return [];
    if (valueSet.url) visited.add(valueSet.url);

    const filters: ValueSetConceptFilter[] = [];
    for (const include of valueSet.compose?.include ?? []) {
        if (include.system && Array.isArray(include.filter)) {
            include.filter.forEach(filter => {
                filters.push({
                    system: include.system!,
                    version: include.version,
                    property: filter.property,
                    op: filter.op,
                    value: filter.value,
                });
            });
        }

        for (const nestedUrl of include.valueSet ?? []) {
            const nested = await resolver.loadValueSetResource(nestedUrl, fhirVersionForMajor(preferredFhirMajor));
            if (nested) {
                filters.push(
                    ...await collectIncludeConceptFilters(
                        nested,
                        resolver,
                        visited,
                        depth + 1,
                        preferredFhirMajor,
                    ),
                );
            }
        }
    }

    return filters;
}

function flattenExpansion(contains: NonNullable<ValueSet['expansion']>['contains'] | undefined): string[] {
    const codes: string[] = [];
    const visit = (entries: ValueSetExpansionEntry[]): void => {
        for (const entry of entries) {
            if (entry.code) {
                if (entry.system) codes.push(`${entry.system}|${entry.code}`);
                codes.push(entry.code);
            }
            if (entry.contains?.length) visit(entry.contains);
        }
    };

    if (contains) visit(contains as ValueSetExpansionEntry[]);
    return codes;
}

async function resolveIncludeOrExclude(
    entry: ValueSetComposeInclude | ValueSetComposeExclude,
    resolver: ValueSetExpansionResolver,
    visited: Set<string>,
    depth: number,
    preferredFhirMajor?: string,
): Promise<string[]> {
    const codes: string[] = [];
    const system = entry.system;

    for (const concept of entry.concept ?? []) {
        if (!concept.code) continue;
        if (system) codes.push(`${system}|${concept.code}`);
        codes.push(concept.code);
    }

    for (const vsUrl of entry.valueSet ?? []) {
        const nested = await resolver.loadValueSetResource(vsUrl);
        if (nested) {
            codes.push(...await collectCodesFromValueSet(
                nested,
                resolver,
                visited,
                depth + 1,
                preferredFhirMajor,
            ));
        }
    }

    const hasConcepts = Boolean(entry.concept?.length);
    const hasFilters = 'filter' in entry && Array.isArray(entry.filter) && entry.filter.length > 0;
    const hasValueSets = Boolean(entry.valueSet?.length);

    if (system && !hasConcepts && !hasFilters && !hasValueSets) {
        const codeSystem = await resolver.loadCodeSystem(system, preferredFhirMajor, entry.version);
        if (codeSystem) {
            for (const code of extractCodesFromCodeSystem(codeSystem)) {
                codes.push(`${system}|${code}`, code);
            }
        } else {
            logger.warn(`[ValueSetPackageLoader] CodeSystem not found for ${system}`);
        }
    }

    if (system && hasFilters) {
        const codeSystem = await resolver.loadCodeSystem(system, preferredFhirMajor, entry.version);
        if (codeSystem) {
            for (const filter of (entry as ValueSetComposeInclude).filter ?? []) {
                for (const code of applyConceptFilter(codeSystem, filter)) {
                    codes.push(`${system}|${code}`, code);
                }
            }
        }
    }

    return codes;
}

function fhirVersionForMajor(preferredFhirMajor?: string): FhirVersion | undefined {
    if (preferredFhirMajor === '4') return 'R4';
    if (preferredFhirMajor === '5') return 'R5';
    if (preferredFhirMajor === '6') return 'R6';
    return undefined;
}
