/** Known HL7 extension fallback and narrative-link compatibility tests. */

import { describe, it, expect, vi } from "vitest";
import { ExtensionValidator } from "../extension-validator";
import { getValueAtPath } from "../../core/validation-utils";
import type { StructureDefinition } from "../../core/structure-definition-types";

const mockSdLoader = { loadProfile: vi.fn() } as any;
const mockTypeValidator = { validate: vi.fn().mockResolvedValue([]) } as any;
const mockValueSetValidator = { validate: vi.fn().mockResolvedValue([]) } as any;
const mockElementRulesValidator = { validate: vi.fn().mockReturnValue([]) } as any;
const validator = new ExtensionValidator(
  mockSdLoader,
  mockTypeValidator,
  mockValueSetValidator,
  mockElementRulesValidator,
);

function makeContext(
  resource: any,
  profileSD: StructureDefinition,
  fhirVersion: "R4" | "R5" = "R4",
) {
  return {
    resource,
    profileSD,
    strictMode: false,
    fhirVersion,
    profileUrl: profileSD.url,
    getValueAtPath: (res: any, path: string) => getValueAtPath(res, path),
  };
}

describe("known HL7 narrative-IG extensions (textLink / narrativeLink)", () => {
    const minimalPatientProfile: StructureDefinition = {
      resourceType: "StructureDefinition",
      url: "http://hl7.org/fhir/StructureDefinition/Patient",
      name: "Patient",
      status: "active",
      kind: "resource",
      abstract: false,
      type: "Patient",
      snapshot: {
        element: [
          {
            id: "Patient",
            path: "Patient",
            min: 0,
            max: "*",
          } as ElementDefinition,
        ],
      },
    };

    it("does not flag textLink as profile-extension-not-found", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/textLink",
            extension: [
              { url: "htmlid", valueString: "a" },
              { url: "data", valueUri: "#a" },
            ],
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag quantity translation as profile-extension-not-found", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/extension-quantity-translation",
            valueString: "translation",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag R5 rendered dosage instruction backport extensions as not found", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationRequest.renderedDosageInstruction",
            valueMarkdown: "Take as directed",
          },
          {
            url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationStatement.renderedDosageInstruction",
            valueMarkdown: "Taken as directed",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag the R5 DiagnosticReport composition backport extension as not found", async () => {
      const resource = {
        resourceType: "DiagnosticReport",
        id: "dr1",
        extension: [
          {
            url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-DiagnosticReport.composition",
            valueReference: {
              reference: "Composition/comp1",
            },
          },
        ],
      };
      const diagnosticReportProfile: StructureDefinition = {
        resourceType: "StructureDefinition",
        url: "http://hl7.org/fhir/StructureDefinition/DiagnosticReport",
        name: "DiagnosticReport",
        status: "active",
        kind: "resource",
        abstract: false,
        type: "DiagnosticReport",
        snapshot: {
          element: [
            {
              id: "DiagnosticReport",
              path: "DiagnosticReport",
              min: 0,
              max: "*",
            } as ElementDefinition,
          ],
        },
      };

      const issues = await validator.validateExtensions(
        resource,
        diagnosticReportProfile,
        makeContext(resource, diagnosticReportProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag the R5 planned start date backport extension as not found", async () => {
      const resource = {
        resourceType: "Encounter",
        id: "enc1",
        extension: [
          {
            url: "http://hl7.org/fhir/5.0/StructureDefinition/extension-Encounter.plannedStartDate",
            valueDateTime: "2026-05-23T10:00:00+02:00",
          },
        ],
      };
      const encounterProfile: StructureDefinition = {
        resourceType: "StructureDefinition",
        url: "http://hl7.org/fhir/StructureDefinition/Encounter",
        name: "Encounter",
        status: "active",
        kind: "resource",
        abstract: false,
        type: "Encounter",
        snapshot: {
          element: [
            {
              id: "Encounter",
              path: "Encounter",
              min: 0,
              max: "*",
            } as ElementDefinition,
          ],
        },
      };

      const issues = await validator.validateExtensions(
        resource,
        encounterProfile,
        makeContext(resource, encounterProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag Firely R5 AuditEvent R4 compatibility extensions as not found", async () => {
      const resource = {
        resourceType: "AuditEvent",
        id: "audit1",
        agent: [
          {
            extension: [
              {
                url: "http://hl7.org/fhir/4.0/StructureDefinition/extension-AuditEvent.agent.network.type",
                valueCoding: { code: "1" },
              },
            ],
          },
        ],
        entity: [
          {
            extension: [
              {
                url: "http://hl7.org/fhir/4.0/StructureDefinition/extension-AuditEvent.entity.type",
                valueCoding: { code: "2" },
              },
            ],
          },
        ],
      };
      const auditEventProfile: StructureDefinition = {
        resourceType: "StructureDefinition",
        url: "http://hl7.org/fhir/StructureDefinition/AuditEvent",
        name: "AuditEvent",
        status: "active",
        kind: "resource",
        abstract: false,
        type: "AuditEvent",
        snapshot: {
          element: [
            {
              id: "AuditEvent",
              path: "AuditEvent",
              min: 0,
              max: "*",
            } as ElementDefinition,
          ],
        },
      };

      const issues = await validator.validateExtensions(
        resource,
        auditEventProfile,
        makeContext(resource, auditEventProfile, "R5"),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("does not flag known HL7 extensions IG canonicals as not found", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/individual-genderIdentity",
            valueCodeableConcept: { text: "nonbinary" },
          },
          {
            url: "http://hl7.org/fhir/StructureDefinition/individual-pronouns",
            valueCodeableConcept: { text: "they/them" },
          },
          {
            url: "http://hl7.org/fhir/StructureDefinition/patient-occupation",
            valueCodeableConcept: { text: "engineer" },
          },
          {
            url: "http://hl7.org/fhir/StructureDefinition/instance-name",
            valueString: "Example name",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-not-found"),
      ).toHaveLength(0);
    });

    it("flags narrativeLink with valueUri instead of valueUrl", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/narrativeLink",
            valueUri: "http://example.org/some#thing",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      const wrong = issues.filter(
        (i) => i.code === "profile-extension-wrong-value-type",
      );
      expect(wrong).toHaveLength(1);
      expect(wrong[0].severity).toBe("error");
      expect(wrong[0].message).toContain(
        "allows for the types [url] but found type uri",
      );
    });

    it("accepts narrativeLink with the correct valueUrl type", async () => {
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/narrativeLink",
            valueUrl: "http://example.org/some#thing",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-wrong-value-type"),
      ).toHaveLength(0);
    });

    it("does not run the type check for the misspelled NarrativeLink (capital N)", async () => {
      // The capital-N URL is treated as known so the entry-recursion pass
      // doesn't double-emit `extension-not-found`, but the type table only
      // covers the canonical lowercase form — so the wrong-value-type
      // check stays quiet here.
      const resource = {
        resourceType: "Patient",
        id: "p1",
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/NarrativeLink",
            valueUri: "http://example.org/some#thing",
          },
        ],
      };

      const issues = await validator.validateExtensions(
        resource,
        minimalPatientProfile,
        makeContext(resource, minimalPatientProfile),
      );
      expect(
        issues.filter((i) => i.code === "profile-extension-wrong-value-type"),
      ).toHaveLength(0);
    });
  });
