/**
 * Reference Format Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceFormatValidator } from '../reference-format-validator';

describe('ReferenceFormatValidator', () => {
    let validator: ReferenceFormatValidator;

    beforeEach(() => {
        validator = new ReferenceFormatValidator();
    });

    describe('validateReferenceString', () => {
        describe('valid reference formats', () => {
            it('should accept relative references (ResourceType/id)', () => {
                const issues = validator.validateReferenceString('Patient/123', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should accept relative references with hyphens', () => {
                const issues = validator.validateReferenceString('Patient/abc-123-def', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should accept relative references with dots', () => {
                const issues = validator.validateReferenceString('Patient/abc.123.def', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should accept contained references (#localId)', () => {
                const issues = validator.validateReferenceString('#patient1', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should accept URN UUID references', () => {
                const issues = validator.validateReferenceString(
                    'urn:uuid:12345678-1234-1234-1234-123456789abc',
                    'subject',
                    'Observation'
                );
                expect(issues).toHaveLength(0);
            });

            it('should accept URN OID references', () => {
                const issues = validator.validateReferenceString('urn:oid:2.16.840.1.113883', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should accept absolute URL references', () => {
                const issues = validator.validateReferenceString(
                    'https://example.com/fhir/Patient/123',
                    'subject',
                    'Observation'
                );
                expect(issues).toHaveLength(0);
            });

            it('should accept absolute URL references with history', () => {
                const issues = validator.validateReferenceString(
                    'https://example.com/fhir/Patient/123/_history/1',
                    'subject',
                    'Observation'
                );
                expect(issues).toHaveLength(0);
            });
        });

        describe('invalid reference formats', () => {
            it('should reject plain text that is not a valid reference', () => {
                const issues = validator.validateReferenceString('not-a-valid-reference', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0].code).toBe('reference-invalid-format');
            });

            it('should reject references without resource type', () => {
                const issues = validator.validateReferenceString('123', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0].code).toBe('reference-invalid-format');
            });

            it('should reject references with lowercase resource type', () => {
                const issues = validator.validateReferenceString('patient/123', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0].code).toBe('reference-invalid-format');
            });

            it('should reject malformed URLs', () => {
                const issues = validator.validateReferenceString('http:/bad-url/Patient/123', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0].code).toBe('reference-invalid-format');
            });

            it('accepts bare `#` as a self-reference to the containing resource', () => {
                // FHIR allows `reference: "#"` to point at the resource that
                // contains this Reference — e.g. a contained
                // OrganizationAffiliation referring back to its parent
                // Organization. See fhir-test-cases `bundle-with-contained`.
                const issues = validator.validateReferenceString('#', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });

            it('should reject malformed URN UUIDs', () => {
                const issues = validator.validateReferenceString('urn:uuid:not-a-uuid', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0].code).toBe('reference-invalid-format');
            });

            it('downgrades labelled urn:uuid placeholders to warnings', () => {
                const issues = validator.validateReferenceString('urn:uuid:patient-fbc-001', 'subject', 'Observation');
                expect(issues).toHaveLength(1);
                expect(issues[0]).toMatchObject({
                    code: 'reference-invalid-format',
                    severity: 'warning',
                });
            });
        });

        describe('unknown resource types', () => {
            it('accepts Substance relative references', () => {
                const issues = validator.validateReferenceString('Substance/additive-1', 'container.additive', 'Specimen');
                expect(issues.some(i => i.code === 'reference-type-unknown')).toBe(false);
            });

            it('accepts PlanDefinition relative references', () => {
                const issues = validator.validateReferenceString(
                    'PlanDefinition/pd-od-sty-008-8-icm9',
                    'ResearchStudy.protocol[0]',
                    'ResearchStudy',
                );

                expect(issues.some(i => i.code === 'reference-type-unknown')).toBe(false);
            });

            it('accepts R5 relative references used by medication and definition resources', () => {
                const references = [
                    'MedicinalProductDefinition/mp-1',
                    'AdministrableProductDefinition/apd-1',
                    'ManufacturedItemDefinition/mid-1',
                    'PackagedProductDefinition/ppd-1',
                    'RegulatedAuthorization/ra-1',
                    'ClinicalUseDefinition/cud-1',
                ];

                for (const reference of references) {
                    const issues = validator.validateReferenceString(
                        reference,
                        'ClinicalUseDefinition.subject[0]',
                        'ClinicalUseDefinition',
                    );

                    expect(issues.some(i => i.code === 'reference-type-unknown')).toBe(false);
                }
            });

            it('should warn about unknown resource types in relative references', () => {
                const issues = validator.validateReferenceString('UnknownResourceType/123', 'subject', 'Observation');
                expect(issues.some(i => i.code === 'reference-type-unknown')).toBe(true);
            });
        });

        describe('edge cases', () => {
            it('should handle empty string', () => {
                const issues = validator.validateReferenceString('', 'subject', 'Observation');
                expect(issues).toHaveLength(0); // Empty is not validated as a format issue
            });

            it('should handle null/undefined', () => {
                const issues1 = validator.validateReferenceString(null as any, 'subject', 'Observation');
                const issues2 = validator.validateReferenceString(undefined as any, 'subject', 'Observation');
                expect(issues1).toHaveLength(0);
                expect(issues2).toHaveLength(0);
            });

            it('should trim whitespace', () => {
                const issues = validator.validateReferenceString('  Patient/123  ', 'subject', 'Observation');
                expect(issues).toHaveLength(0);
            });
        });
    });

    describe('validateAllReferences', () => {
        it('should find all references in a resource', () => {
            const resource = {
                resourceType: 'Observation',
                id: 'test-1',
                subject: { reference: 'not-valid' },
                encounter: { reference: 'Encounter/123' },
                performer: [
                    { reference: 'also-not-valid' },
                    { reference: 'Practitioner/456' }
                ]
            };

            const issues = validator.validateAllReferences(resource);

            // Should find 2 invalid references: subject and performer[0]
            const invalidFormatIssues = issues.filter(i => i.code === 'reference-invalid-format');
            expect(invalidFormatIssues).toHaveLength(2);
        });

        it('should handle deeply nested references', () => {
            const resource = {
                resourceType: 'Condition',
                id: 'test-2',
                stage: [{
                    assessment: [
                        { reference: 'invalid-ref' }
                    ]
                }]
            };

            const issues = validator.validateAllReferences(resource);
            expect(issues.some(i => i.code === 'reference-invalid-format')).toBe(true);
        });

        it('does not treat Expression.reference as a FHIR Reference.reference', () => {
            const resource = {
                resourceType: 'PlanDefinition',
                id: 'test-plan',
                action: [{
                    condition: [{
                        kind: 'applicability',
                        expression: {
                            language: 'text/cql',
                            reference: 'cql/QuestionnaireLogicLibrary|1.0',
                        },
                    }],
                    participant: [{
                        actorCanonical: 'http://example.org/fhir/ActorDefinition/clinician',
                    }],
                }],
                subjectReference: {
                    reference: 'not-valid',
                },
            };

            const issues = validator.validateAllReferences(resource);

            expect(issues.some(i =>
                i.code === 'reference-invalid-format'
                && i.path === 'PlanDefinition.action[0].condition[0].expression.reference'
            )).toBe(false);
            expect(issues.some(i =>
                i.code === 'reference-invalid-format'
                && i.path === 'PlanDefinition.subjectReference.reference'
            )).toBe(true);
        });

        it('should return empty array for resources without references', () => {
            const resource = {
                resourceType: 'Patient',
                id: 'test-3',
                name: [{ family: 'Test', given: ['John'] }]
            };

            const issues = validator.validateAllReferences(resource);
            expect(issues).toHaveLength(0);
        });
    });
});
