export type FHIRVersion = 'R4' | 'R4B' | 'R5' | 'R6';

export interface VersionCompatibilityConfig {
    targetVersion: FHIRVersion;
    reportDeprecated: boolean;
    reportRenamed: boolean;
}

export interface DeprecatedElement {
    resourceType: string;
    path: string;
    deprecatedIn: FHIRVersion;
    removedIn?: FHIRVersion;
    replacement?: string;
    migrationHint: string;
}

export interface RenamedElement {
    resourceType: string;
    oldPath: string;
    newPath: string;
    changedIn: FHIRVersion;
}

export const DEPRECATED_ELEMENTS: DeprecatedElement[] = [
    {
        resourceType: 'Patient',
        path: 'Patient.managingOrganization',
        deprecatedIn: 'R5',
        replacement: 'Patient.generalPractitioner',
        migrationHint: 'Use generalPractitioner with appropriate role instead',
    },
    {
        resourceType: 'Encounter',
        path: 'Encounter.hospitalization',
        deprecatedIn: 'R5',
        replacement: 'Encounter.admission',
        migrationHint: 'hospitalization was renamed to admission in R5',
    },
    {
        resourceType: 'Encounter',
        path: 'Encounter.class',
        deprecatedIn: 'R5',
        migrationHint: 'class changed from Coding to CodeableConcept in R5',
    },
    {
        resourceType: 'MedicationRequest',
        path: 'MedicationRequest.medicationCodeableConcept',
        deprecatedIn: 'R5',
        replacement: 'MedicationRequest.medication',
        migrationHint: 'medication[x] consolidated to CodeableReference in R5',
    },
    {
        resourceType: 'MedicationRequest',
        path: 'MedicationRequest.medicationReference',
        deprecatedIn: 'R5',
        replacement: 'MedicationRequest.medication',
        migrationHint: 'Use medication with CodeableReference type',
    },
    {
        resourceType: 'Observation',
        path: 'Observation.performer',
        deprecatedIn: 'R6',
        migrationHint: 'performer may be replaced with more specific roles in R6',
    },
    {
        resourceType: 'Condition',
        path: 'Condition.asserter',
        deprecatedIn: 'R5',
        migrationHint: 'Consider using participant with asserter role instead',
    },
    {
        resourceType: 'DiagnosticReport',
        path: 'DiagnosticReport.imagingStudy',
        deprecatedIn: 'R5',
        replacement: 'DiagnosticReport.study',
        migrationHint: 'imagingStudy renamed to study in R5',
    },
    {
        resourceType: 'Procedure',
        path: 'Procedure.reasonReference',
        deprecatedIn: 'R5',
        replacement: 'Procedure.reason',
        migrationHint: 'reasonCode and reasonReference merged into reason (CodeableReference)',
    },
    {
        resourceType: 'Bundle',
        path: 'Bundle.signature',
        deprecatedIn: 'R5',
        migrationHint: 'Bundle.signature moved to individual components in R5',
    },
];

export const RENAMED_ELEMENTS: RenamedElement[] = [
    { resourceType: 'Encounter', oldPath: 'hospitalization', newPath: 'admission', changedIn: 'R5' },
    { resourceType: 'DiagnosticReport', oldPath: 'imagingStudy', newPath: 'study', changedIn: 'R5' },
    { resourceType: 'Procedure', oldPath: 'reasonCode', newPath: 'reason', changedIn: 'R5' },
    { resourceType: 'Procedure', oldPath: 'reasonReference', newPath: 'reason', changedIn: 'R5' },
];
