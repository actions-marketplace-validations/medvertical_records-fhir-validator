export type PIILocale = 'us' | 'de' | 'all';

export interface SecurityValidationConfig {
    detectPHI: boolean;
    detectSensitiveIdentifiers: boolean;
    requireSecurityLabels: boolean;
    validateAuditTrail: boolean;
    piiLocale: PIILocale;
    customPatterns?: { pattern: string; name: string; severity: 'warning' | 'info' }[];
}

export interface PHIDetectionResult {
    found: boolean;
    type: string;
    path: string;
    preview?: string;
}
