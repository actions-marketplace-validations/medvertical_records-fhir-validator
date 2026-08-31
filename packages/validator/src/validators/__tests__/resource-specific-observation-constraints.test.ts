import { describe, expect, it } from 'vitest';
import { validateObservationConstraints } from '../resource-specific-observation-constraints.js';

describe('validateObservationConstraints', () => {
    it('reports incompatible values and absent reasons', () => {
        const issues = validateObservationConstraints({
            resourceType: 'Observation',
            valueString: 'present',
            dataAbsentReason: { coding: [{ code: 'unknown' }] },
        });

        expect(issues.map(issue => issue.code)).toContain('obs-6-violation');
    });

    it('reports incomplete vital-sign components', () => {
        const issues = validateObservationConstraints({
            resourceType: 'Observation',
            category: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                    code: 'vital-signs',
                }],
            }],
            component: [{}],
        });

        expect(issues.map(issue => issue.code)).toContain('invariant-vs-3-violation');
    });

    it('safely ignores malformed non-object inputs', () => {
        expect(validateObservationConstraints(null)).toEqual([]);
        expect(validateObservationConstraints(['Observation'])).toEqual([]);
    });
});
