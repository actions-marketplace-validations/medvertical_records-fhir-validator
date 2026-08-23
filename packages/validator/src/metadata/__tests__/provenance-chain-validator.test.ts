/**
 * Provenance Chain Validator Tests
 *
 * Exercises the structural checks implemented in
 * `provenance-chain-validator.ts`: target presence / well-formedness,
 * `recorded` instant, agent presence, and `occurred` vs. `recorded`
 * ordering.
 */

import { describe, it, expect } from 'vitest';
import { validateProvenanceChain } from '../provenance-chain-validator';

const VALID_PROVENANCE = {
    resourceType: 'Provenance',
    id: 'example',
    target: [{ reference: 'Patient/example' }],
    recorded: '2026-04-08T10:15:30Z',
    agent: [
        {
            who: { reference: 'Practitioner/42' },
        },
    ],
};

describe('validateProvenanceChain', () => {
    it('returns no issues for a well-formed Provenance resource', () => {
        const issues = validateProvenanceChain(VALID_PROVENANCE);
        expect(issues).toHaveLength(0);
    });

    it('is a no-op for non-Provenance resources', () => {
        const issues = validateProvenanceChain({
            resourceType: 'Patient',
            id: 'p1',
        });
        expect(issues).toHaveLength(0);
    });

    it('rejects missing or empty target arrays', () => {
        const noTarget = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: undefined,
        });
        expect(noTarget.map(i => i.code)).toContain('provenance-missing-target');

        const emptyTarget = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [],
        });
        expect(emptyTarget.map(i => i.code)).toContain('provenance-missing-target');
    });

    it('rejects malformed target references', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [{ reference: 'not a reference' }],
        });
        expect(issues.map(i => i.code)).toContain(
            'provenance-target-malformed-reference',
        );
    });

    it('accepts absolute URL and urn:uuid references as well-formed', () => {
        const absolute = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [{ reference: 'https://example.org/fhir/Patient/example' }],
        });
        expect(absolute).toHaveLength(0);

        const uuid = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [{ reference: 'urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890' }],
        });
        expect(uuid).toHaveLength(0);
    });

    it('uses the shared reference policy for contained and conditional references', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [
                { reference: '#embedded' },
                { reference: 'Patient?identifier=https://example.org|123' },
            ],
        });

        expect(issues).toHaveLength(0);
    });

    it('accepts target with identifier instead of reference', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [
                {
                    identifier: {
                        system: 'https://example.org/identifiers',
                        value: 'abc',
                    },
                },
            ],
        });
        expect(issues.filter(i => i.code.startsWith('provenance-target'))).toHaveLength(0);
    });

    it('requires a valid FHIR instant for recorded', () => {
        const missing = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: undefined,
        });
        expect(missing.map(i => i.code)).toContain('provenance-missing-recorded');

        const bad = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: 'yesterday',
        });
        expect(bad.map(i => i.code)).toContain('provenance-invalid-recorded');

        const dateOnly = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: '2026-04-08',
        });
        expect(dateOnly.map(i => i.code)).toContain('provenance-invalid-recorded');
    });

    it('rejects calendar-invalid instants and invalid timezone offsets', () => {
        for (const recorded of [
            '2026-02-31T10:00:00Z',
            '2026-04-08T25:00:00Z',
            '2026-04-08T10:00:00+14:30',
        ]) {
            const issues = validateProvenanceChain({
                ...VALID_PROVENANCE,
                recorded,
            });
            expect(issues.map(i => i.code)).toContain('provenance-invalid-recorded');
        }
    });

    it('accepts a FHIR leap second and keeps temporal comparison deterministic', () => {
        const validLeapSecond = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: '2016-12-31T23:59:60Z',
            occurredDateTime: '2016-12-31T23:59:59Z',
        });
        expect(validLeapSecond.map(i => i.code)).not.toContain('provenance-invalid-recorded');
        expect(validLeapSecond.map(i => i.code)).not.toContain('provenance-recorded-before-event');
    });

    it('requires at least one agent with identifiable who', () => {
        const noAgent = validateProvenanceChain({
            ...VALID_PROVENANCE,
            agent: undefined,
        });
        expect(noAgent.map(i => i.code)).toContain('provenance-missing-agent');

        const emptyAgent = validateProvenanceChain({
            ...VALID_PROVENANCE,
            agent: [],
        });
        expect(emptyAgent.map(i => i.code)).toContain('provenance-missing-agent');

        const agentWithoutWho = validateProvenanceChain({
            ...VALID_PROVENANCE,
            agent: [{ who: { display: 'anonymous' } }],
        });
        expect(agentWithoutWho.map(i => i.code)).toContain(
            'provenance-agent-missing-who',
        );
    });

    it('warns if recorded precedes the occurred event', () => {
        const occurredLater = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: '2026-04-08T10:00:00Z',
            occurredDateTime: '2026-04-09T08:00:00Z',
        });
        expect(occurredLater.map(i => i.code)).toContain(
            'provenance-recorded-before-event',
        );

        const occurredEarlier = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: '2026-04-08T10:00:00Z',
            occurredDateTime: '2026-04-07T08:00:00Z',
        });
        expect(occurredEarlier.map(i => i.code)).not.toContain(
            'provenance-recorded-before-event',
        );
    });

    it('uses occurredPeriod.end when checking ordering', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            recorded: '2026-04-08T10:00:00Z',
            occurredPeriod: {
                start: '2026-04-05T10:00:00Z',
                end: '2026-04-10T10:00:00Z',
            },
        });
        expect(issues.map(i => i.code)).toContain(
            'provenance-recorded-before-event',
        );
    });

    it('rejects a malformed agent reference', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            agent: [{ who: { reference: 'nothing-useful' } }],
        });
        expect(issues.map(i => i.code)).toContain(
            'provenance-agent-malformed-reference',
        );
    });

    it('does not treat malformed or empty identifiers as logical references', () => {
        const targetIssues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [{ identifier: {} }, { identifier: 'patient-1' }],
        });
        expect(
            targetIssues.filter(i => i.code === 'provenance-target-missing-reference'),
        ).toHaveLength(2);

        const agentIssues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            agent: [{ who: { identifier: [] } }, { who: { identifier: false } }],
        });
        expect(
            agentIssues.filter(i => i.code === 'provenance-agent-missing-who'),
        ).toHaveLength(2);
    });

    it('handles malformed target, agent, and recorded values without throwing', () => {
        const issues = validateProvenanceChain({
            ...VALID_PROVENANCE,
            target: [null, [], 'Patient/example'],
            agent: [null, [], 'Practitioner/42'],
            recorded: Symbol('invalid'),
        });

        expect(
            issues.filter(i => i.code === 'provenance-target-invalid'),
        ).toHaveLength(3);
        expect(
            issues.filter(i => i.code === 'provenance-agent-missing-who'),
        ).toHaveLength(3);
        expect(issues.map(i => i.code)).toContain('provenance-invalid-recorded');
    });

    it('creates deterministic IDs and distinguishes findings at different paths', () => {
        const resource = {
            ...VALID_PROVENANCE,
            target: [{}, {}],
        };

        const first = validateProvenanceChain(resource);
        const second = validateProvenanceChain(resource);

        expect(first.map(i => i.id)).toEqual(second.map(i => i.id));
        expect(new Set(first.map(i => i.id)).size).toBe(first.length);
    });
});
