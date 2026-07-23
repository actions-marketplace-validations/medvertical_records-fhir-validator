export function constraintPassed(result: any): boolean {
    // FHIR invariants are required to evaluate to the Boolean value `true`.
    // An empty collection is not success: in three-valued FHIRPath logic an
    // expression such as `emptyCollection implies false` evaluates to empty,
    // which the reference validator correctly reports as a failed invariant.
    if (result === undefined || result === null) return false;
    if (typeof result === 'boolean') return result;
    if (Array.isArray(result)) {
        if (result.length === 0) return false;
        if (result.every(item => typeof item === 'boolean')) {
            return result.every(Boolean);
        }
        return false;
    }
    return false;
}
