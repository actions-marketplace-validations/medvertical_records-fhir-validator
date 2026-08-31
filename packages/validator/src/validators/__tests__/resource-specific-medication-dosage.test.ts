import { describe, expect, it } from 'vitest';
import { validateGermanMedicationDosage } from '../resource-specific-medication-dosage.js';

const PROFILE = 'https://www.medizininformatik-initiative.de/fhir/core/modul-medikation/MedicationRequest';

describe('validateGermanMedicationDosage', () => {
    it('requires both structured dosage halves', () => {
        const issues = validateGermanMedicationDosage({
            resourceType: 'MedicationRequest',
            meta: { profile: [PROFILE] },
            dosageInstruction: [{ timing: { repeat: { frequency: 1 } } }],
        });

        expect(issues.map(issue => issue.ruleId)).toContain('DosageStructuredRequiresBoth');
    });

    it('detects a four-part free-text dosage pattern', () => {
        const issues = validateGermanMedicationDosage({
            resourceType: 'MedicationStatement',
            meta: { profile: [PROFILE] },
            dosage: [{ text: '1-1-1-1' }],
        });

        expect(issues.map(issue => issue.ruleId)).toContain('DosageWarnungViererschemaInText');
    });

    it('safely ignores malformed non-object inputs', () => {
        expect(validateGermanMedicationDosage(null, PROFILE)).toEqual([]);
        expect(validateGermanMedicationDosage(['MedicationRequest'], PROFILE)).toEqual([]);
    });
});
