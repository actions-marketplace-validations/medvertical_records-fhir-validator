import { describe, expect, it } from 'vitest';
import { EarlyTerminationValidator } from '../early-termination-validator.js';

describe('EarlyTerminationValidator', () => {
    const validator = new EarlyTerminationValidator();

    it.each([null, undefined, [], 'Patient', 3])('rejects non-resource input %j', input => {
        expect(validator.check(input).shouldContinue).toBe(false);
        expect(validator.isMinimallyValid(input)).toBe(false);
    });

    it('accepts a minimally structured FHIR resource', () => {
        expect(validator.check({ resourceType: 'Patient' })).toMatchObject({
            shouldContinue: true,
            issues: [],
        });
    });

    it('reports unknown resource types without terminating forward-compatible validation', () => {
        const result = validator.check({ resourceType: 'FutureResource' });
        expect(result.shouldContinue).toBe(true);
        expect(result.issues.map(issue => issue.code)).toContain('early-termination-unknown-resourcetype');
    });
});
