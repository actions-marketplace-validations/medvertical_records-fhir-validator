export type SubsumptionOutcome = 'subsumes' | 'subsumed-by' | 'equivalent' | 'not-subsumed' | 'unknown';

export interface CodeSystemValidationIssue {
    severity: 'error' | 'warning' | 'information';
    code: string;
    message: string;
    expression?: string[];
    source?: 'local-code-system' | 'terminology-server';
}

export interface CodeSystemValidationResult {
    valid: boolean;
    message?: string;
    reason?: 'code-unknown' | 'system-unresolvable' | 'display-mismatch' | 'remote-budget-exhausted';
    issues?: CodeSystemValidationIssue[];
    inactive?: boolean;
    display?: string;
}
