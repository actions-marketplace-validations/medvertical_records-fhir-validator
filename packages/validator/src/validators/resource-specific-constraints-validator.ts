/**
 * Resource-specific invariant implementations that are easier and safer
 * to evaluate directly than through generic FHIRPath.
 */

import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { logger } from '../logger';
import { validateGermanMedicationDosage } from './resource-specific-medication-dosage';
import { validateObservationConstraints } from './resource-specific-observation-constraints';

export class ResourceSpecificConstraintsValidator {

    validate(resource: any, existingIssues: ValidationIssue[] = [], profileUrl?: string): ValidationIssue[] {
        if (!resource?.resourceType) return [];

        switch (resource.resourceType) {
            case 'Condition':
                return this.validateCondition(resource);
            case 'Patient':
                return this.validatePatient(resource, existingIssues);
            case 'Bundle':
                return this.validateBundle(resource);
            case 'AllergyIntolerance':
                return this.validateAllergyIntolerance(resource);
            case 'Composition':
                return this.validateComposition(resource);
            case 'Observation':
                return validateObservationConstraints(resource);
            case 'MedicationRequest':
            case 'MedicationDispense':
            case 'MedicationStatement':
                return validateGermanMedicationDosage(resource, profileUrl);
            default:
                return [];
        }
    }

    private validateCondition(resource: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        logger.debug('[ResourceConstraints] Validating Condition constraints');

        const clinicalStatus = this.getClinicalStatusCode(resource);

        const verificationStatus = this.getVerificationStatusCode(resource);

        if (
            this.hasCode(resource.category, 'problem-list-item') &&
            verificationStatus !== 'entered-in-error' &&
            !clinicalStatus
        ) {
            issues.push(createValidationIssue({
                code: 'profile-constraint-warning',
                path: 'Condition.clinicalStatus',
                resourceType: 'Condition',
                customMessage: 'Constraint \'con-3\' failed: Condition.clinicalStatus SHALL be present if verificationStatus is not entered-in-error and category is problem-list-item',
                ruleId: 'con-3',
                severityOverride: 'warning',
                aspectOverride: 'profile',
                details: {
                    constraintKey: 'con-3',
                    originalSeverity: 'warning',
                },
            }));
        }

        if (resource.abatementDateTime || resource.abatementAge || resource.abatementPeriod ||
            resource.abatementRange || resource.abatementString) {
            const abatedStatuses = ['inactive', 'remission', 'resolved'];
            if (clinicalStatus && !abatedStatuses.includes(clinicalStatus)) {
                issues.push(createValidationIssue({
                    code: 'con-4-violation',
                    path: 'Condition.abatement[x]',
                    resourceType: 'Condition',
                    customMessage: 'con-4: If abatement is present, clinicalStatus SHALL be inactive/remission/resolved',
                    severityOverride: 'error',
                }));
            }
        }

        if (verificationStatus === 'entered-in-error' && clinicalStatus) {
            issues.push(createValidationIssue({
                code: 'con-5-violation',
                path: 'Condition.clinicalStatus',
                resourceType: 'Condition',
                customMessage: 'con-5: clinicalStatus SHALL NOT be present if verificationStatus is entered-in-error',
                severityOverride: 'error',
            }));
        }

        return issues;
    }

    private getClinicalStatusCode(condition: any): string | null {
        return condition.clinicalStatus?.coding?.[0]?.code || null;
    }

    private getVerificationStatusCode(condition: any): string | null {
        return condition.verificationStatus?.coding?.[0]?.code || null;
    }

    private hasCode(value: any, code: string): boolean {
        const values = Array.isArray(value) ? value : value ? [value] : [];

        return values.some(item => {
            if (item?.code === code) return true;
            if (Array.isArray(item?.coding)) {
                return item.coding.some((coding: any) => coding?.code === code);
            }
            return false;
        });
    }

    private validatePatient(resource: any, existingIssues: ValidationIssue[] = []): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        logger.debug('[ResourceConstraints] Validating Patient constraints');

        if (resource.contact && Array.isArray(resource.contact)) {
            for (let i = 0; i < resource.contact.length; i++) {
                const contact = resource.contact[i];
                const hasName = contact.name && Object.keys(contact.name).length > 0;
                const hasTelecom = contact.telecom && Array.isArray(contact.telecom) && contact.telecom.length > 0;
                const hasAddress = contact.address && Object.keys(contact.address).length > 0;
                const hasOrganization = contact.organization && Object.keys(contact.organization).length > 0;

                if (!hasName && !hasTelecom && !hasAddress && !hasOrganization) {
                    issues.push(createValidationIssue({
                        code: 'pat-1-violation',
                        path: `Patient.contact[${i}]`,
                        resourceType: 'Patient',
                        customMessage: 'pat-1: contact SHALL have at least one of name, telecom, address, or organization',
                        severityOverride: 'error',
                    }));
                }
            }
        }

        // This business rule runs in the invariant bucket, even though the
        // code metadata declares it as custom_rule.
        if (typeof resource.birthDate === 'string' && resource.birthDate.length > 0) {
            const bd = new Date(resource.birthDate);
            const hasProfileMaxValueIssue = existingIssues.some(issue =>
                issue.code === 'profile-max-value-duration-violation' &&
                issue.path === 'Patient.birthDate'
            );

            if (!Number.isNaN(bd.getTime()) && bd.getTime() > Date.now() && !hasProfileMaxValueIssue) {
                issues.push(createValidationIssue({
                    code: 'business-future-birth-date',
                    path: 'Patient.birthDate',
                    resourceType: 'Patient',
                    customMessage:
                        `Patient.birthDate is in the future (${resource.birthDate}). ` +
                        `This is almost always a data-entry or timezone bug; age-based ` +
                        `dosage and cohort queries will mis-classify the patient.`,
                    severityOverride: 'warning',
                    aspectOverride: 'invariant',
                }));
            }
        }

        return issues;
    }

    private validateBundle(resource: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        logger.debug('[ResourceConstraints] Validating Bundle constraints');

        const bundleType = resource.type;

        if (resource.total !== undefined) {
            if (bundleType !== 'searchset' && bundleType !== 'history') {
                issues.push(createValidationIssue({
                    code: 'bdl-1-violation',
                    path: 'Bundle.total',
                    resourceType: 'Bundle',
                    customMessage: 'bdl-1: total only when type is searchset or history',
                    severityOverride: 'error',
                }));
            }
        }

        if (resource.entry && Array.isArray(resource.entry)) {
            for (let i = 0; i < resource.entry.length; i++) {
                if (resource.entry[i].search && bundleType !== 'searchset') {
                    issues.push(createValidationIssue({
                        code: 'bdl-2-violation',
                        path: `Bundle.entry[${i}].search`,
                        resourceType: 'Bundle',
                        customMessage: 'bdl-2: entry.search only when type is searchset',
                        severityOverride: 'error',
                    }));
                    break;
                }
            }
        }

        if (resource.entry && Array.isArray(resource.entry)) {
            const validRequestTypes = ['batch', 'transaction', 'history'];
            for (let i = 0; i < resource.entry.length; i++) {
                if (resource.entry[i].request && !validRequestTypes.includes(bundleType)) {
                    issues.push(createValidationIssue({
                        code: 'bdl-3-violation',
                        path: `Bundle.entry[${i}].request`,
                        resourceType: 'Bundle',
                        customMessage: 'bdl-3: entry.request only when type is batch/transaction/history',
                        severityOverride: 'error',
                    }));
                    break;
                }
            }
        }

        if (resource.entry && Array.isArray(resource.entry)) {
            const validResponseTypes = ['batch-response', 'transaction-response', 'history'];
            for (let i = 0; i < resource.entry.length; i++) {
                if (resource.entry[i].response && !validResponseTypes.includes(bundleType)) {
                    issues.push(createValidationIssue({
                        code: 'bdl-4-violation',
                        path: `Bundle.entry[${i}].response`,
                        resourceType: 'Bundle',
                        customMessage: 'bdl-4: entry.response only when type is batch-response/transaction-response/history',
                        severityOverride: 'error',
                    }));
                    break;
                }
            }
        }

        return issues;
    }

    private validateAllergyIntolerance(resource: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        logger.debug('[ResourceConstraints] Validating AllergyIntolerance constraints');

        const clinicalStatus = resource.clinicalStatus?.coding?.[0]?.code || null;
        const verificationStatus = resource.verificationStatus?.coding?.[0]?.code || null;

        if (verificationStatus !== 'entered-in-error' && !clinicalStatus) {
            issues.push(createValidationIssue({
                code: 'ait-1-violation',
                path: 'AllergyIntolerance.clinicalStatus',
                resourceType: 'AllergyIntolerance',
                customMessage: 'ait-1: AllergyIntolerance.clinicalStatus SHALL be present if verificationStatus is not entered-in-error',
                severityOverride: 'error',
            }));
        }

        if (verificationStatus === 'entered-in-error' && clinicalStatus) {
            issues.push(createValidationIssue({
                code: 'ait-2-violation',
                path: 'AllergyIntolerance.clinicalStatus',
                resourceType: 'AllergyIntolerance',
                customMessage: 'ait-2: AllergyIntolerance.clinicalStatus SHALL NOT be present if verificationStatus is entered-in-error',
                severityOverride: 'error',
            }));
        }

        return issues;
    }

    private validateComposition(resource: any): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        logger.debug('[ResourceConstraints] Validating Composition constraints');

        if (resource.section && Array.isArray(resource.section)) {
            for (let i = 0; i < resource.section.length; i++) {
                issues.push(...this.validateCompositionSection(resource.section[i], `Composition.section[${i}]`));
            }
        }

        return issues;
    }

    private validateCompositionSection(section: any, path: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        const hasText = section.text && section.text.div;
        const hasEntry = section.entry && Array.isArray(section.entry) && section.entry.length > 0;
        const hasSubSection = section.section && Array.isArray(section.section) && section.section.length > 0;

        if (!hasText && !hasEntry && !hasSubSection) {
            issues.push(createValidationIssue({
                code: 'cmp-1-violation',
                path,
                resourceType: 'Composition',
                customMessage: 'cmp-1: A section must contain at least one of text, entry, or sub-section',
                severityOverride: 'error',
            }));
        }

        if (section.emptyReason && hasEntry) {
            issues.push(createValidationIssue({
                code: 'cmp-2-violation',
                path,
                resourceType: 'Composition',
                customMessage: 'cmp-2: A section can only have an emptyReason if it has no entries',
                severityOverride: 'error',
            }));
        }

        if (hasSubSection) {
            for (let i = 0; i < section.section.length; i++) {
                issues.push(...this.validateCompositionSection(section.section[i], `${path}.section[${i}]`));
            }
        }

        return issues;
    }

}

export const resourceSpecificConstraintsValidator = new ResourceSpecificConstraintsValidator();
