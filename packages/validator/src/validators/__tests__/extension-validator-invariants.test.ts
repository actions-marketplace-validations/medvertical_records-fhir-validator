import { describe, expect, it, vi } from "vitest";
import { ExtensionValidator } from "../extension-validator";
import { getValueAtPath } from "../../core/validation-utils";
import type {
  StructureDefinition,
  ElementDefinition,
} from "../../core/structure-definition-types";

function makeContext(resource: any, profileSD: StructureDefinition) {
  return {
    resource,
    profileSD,
    strictMode: false,
    fhirVersion: "R4" as const,
    profileUrl: profileSD.url,
    getValueAtPath: (res: any, path: string) => getValueAtPath(res, path),
  };
}

describe("ExtensionValidator invariants", () => {
  it("evaluates root invariants declared by an extension profile", async () => {
    const extensionUrl =
      "http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/newpatients";
    const extensionProfile: StructureDefinition = {
      resourceType: "StructureDefinition",
      url: extensionUrl,
      name: "NewPatients",
      status: "active",
      kind: "complex-type",
      abstract: false,
      type: "Extension",
      snapshot: {
        element: [
          {
            id: "Extension",
            path: "Extension",
            min: 0,
            max: "*",
            constraint: [
              {
                key: "new-patients-characteristics",
                severity: "error",
                human:
                  "If no new patients are accepted, no characteristics are allowed",
                expression:
                  "extension.where(url='acceptingPatients').value.ofType(CodeableConcept).coding.where(code = 'no') implies extension.where(url='characteristics').empty()",
              },
            ],
          } as ElementDefinition,
        ],
      },
    };
    const patientProfile: StructureDefinition = {
      resourceType: "StructureDefinition",
      url: "http://example.org/StructureDefinition/patient-with-new-patients",
      name: "PatientWithNewPatients",
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
          {
            id: "Patient.extension:newPatients",
            path: "Patient.extension",
            sliceName: "newPatients",
            min: 0,
            max: "*",
            type: [{ code: "Extension", profile: [extensionUrl] }],
          } as ElementDefinition,
        ],
      },
    };
    const sdLoader = {
      loadProfile: vi.fn(async (url: string) =>
        url === extensionUrl ? extensionProfile : null,
      ),
    } as any;
    const extensionValidator = new ExtensionValidator(
      sdLoader,
      { validate: vi.fn().mockResolvedValue([]) } as any,
      { validateBinding: vi.fn().mockResolvedValue([]) } as any,
      { validate: vi.fn().mockReturnValue([]) } as any,
    );
    const resource = {
      resourceType: "Patient",
      extension: [
        {
          url: extensionUrl,
          extension: [
            {
              url: "acceptingPatients",
              valueCodeableConcept: { coding: [{ code: "no" }] },
            },
            {
              url: "characteristics",
              valueCodeableConcept: { text: "pediatric patients" },
            },
          ],
        },
      ],
    };

    const issues = await extensionValidator.validateExtensions(
      resource,
      patientProfile,
      makeContext(resource, patientProfile),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "constraint-violation-new-patients-characteristics",
        severity: "error",
        resourceType: "Patient",
        path: `Patient.extension[url='${extensionUrl}']`,
        ruleId: "new-patients-characteristics",
      }),
    );

    // FHIRPath's three-valued implication produces an empty collection
    // when the antecedent is empty and the consequent is false. Invariant
    // evaluation requires an explicit true, so this is also a violation
    // (and matches the Java reference validator used for parity checks).
    const emptyImplicationResource = {
      resourceType: "Patient",
      extension: [
        {
          url: extensionUrl,
          extension: [
            {
              url: "acceptingPatients",
              valueCodeableConcept: { coding: [{ code: "newpt" }] },
            },
            { url: "characteristics", valueString: "Non-smoker" },
          ],
        },
      ],
    };
    const emptyImplicationIssues = await extensionValidator.validateExtensions(
      emptyImplicationResource,
      patientProfile,
      makeContext(emptyImplicationResource, patientProfile),
    );
    expect(emptyImplicationIssues).toContainEqual(
      expect.objectContaining({
        code: "constraint-violation-new-patients-characteristics",
        severity: "error",
      }),
    );
  });

  it("evaluates extension invariants with %resource bound to the containing resource", async () => {
    const extensionUrl = "http://fhir.de/StructureDefinition/gender-amtlich-de";
    const extensionProfile: StructureDefinition = {
      resourceType: "StructureDefinition",
      url: extensionUrl,
      name: "GenderAmtlichDe",
      status: "active",
      kind: "complex-type",
      abstract: false,
      type: "Extension",
      snapshot: {
        element: [
          {
            id: "Extension",
            path: "Extension",
            min: 0,
            max: "*",
          } as ElementDefinition,
          {
            id: "Extension.value[x]",
            path: "Extension.value[x]",
            min: 1,
            max: "1",
            type: [{ code: "Coding" }],
            constraint: [
              {
                key: "gender-amtlich-1",
                severity: "error",
                human: "The extension is only allowed when gender is 'other'",
                expression: "%resource.where(gender='other').exists()",
              },
            ],
          } as ElementDefinition,
        ],
      },
    };
    const patientProfile: StructureDefinition = {
      resourceType: "StructureDefinition",
      url: "http://example.org/StructureDefinition/patient-with-gender-amtlich",
      name: "PatientWithGenderAmtlich",
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
          {
            id: "Patient.gender.extension:other-amtlich",
            path: "Patient.gender.extension",
            sliceName: "other-amtlich",
            min: 0,
            max: "1",
            type: [{ code: "Extension", profile: [extensionUrl] }],
          } as ElementDefinition,
        ],
      },
    };
    const sdLoader = {
      loadProfile: vi.fn(async (url: string) =>
        url === extensionUrl ? extensionProfile : null,
      ),
    } as any;
    const extensionValidator = new ExtensionValidator(
      sdLoader,
      { validate: vi.fn().mockResolvedValue([]) } as any,
      { validateBinding: vi.fn().mockResolvedValue([]) } as any,
      { validate: vi.fn().mockReturnValue([]) } as any,
    );
    const validResource = {
      resourceType: "Patient",
      gender: "other",
      _gender: {
        extension: [
          {
            url: extensionUrl,
            valueCoding: {
              system: "http://fhir.de/CodeSystem/gender-amtlich-de",
              code: "D",
            },
          },
        ],
      },
    };

    const validIssues = await extensionValidator.validateExtensions(
      validResource,
      patientProfile,
      makeContext(validResource, patientProfile),
    );
    expect(
      validIssues.filter((i) => i.ruleId === "gender-amtlich-1"),
    ).toHaveLength(0);

    const invalidResource = { ...validResource, gender: "female" };
    const invalidIssues = await extensionValidator.validateExtensions(
      invalidResource,
      patientProfile,
      makeContext(invalidResource, patientProfile),
    );
    expect(invalidIssues).toContainEqual(
      expect.objectContaining({
        code: "constraint-violation-gender-amtlich-1",
        severity: "error",
        resourceType: "Patient",
        ruleId: "gender-amtlich-1",
      }),
    );
  });
});
