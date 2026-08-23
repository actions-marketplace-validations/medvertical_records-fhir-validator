import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StructureDefinition,
  ElementDefinition,
} from "../../structure-definition-types";
vi.mock("../../../logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  TerminologyExecutor,
  type TerminologyValidationContext,
} from "../terminology-executor";
import {
  createTerminologyValidationPortMock,
  type TerminologyValidationPortMock,
} from "./terminology-validation-port.test-support";

let executor: TerminologyExecutor;
let validatorInstance: TerminologyValidationPortMock;
let mockContext: TerminologyValidationContext;
let mockStructureDef: StructureDefinition;

beforeEach(() => {
  vi.clearAllMocks();
  validatorInstance = createTerminologyValidationPortMock();
  executor = new TerminologyExecutor(validatorInstance);
  mockStructureDef = {
    id: "test-structure",
    url: "http://test.org/StructureDefinition/Test",
    type: "Observation",
    snapshot: { element: [] },
  };
  mockContext = {
    resource: { resourceType: "Observation", id: "test-001" },
    structureDef: mockStructureDef,
    getValueAtPath: (resource: any, path: string) => {
      const parts = path.split(".");
      let value = resource;
      for (const part of parts.slice(1)) value = value?.[part];
      return value;
    },
  };
});

describe("TerminologyExecutor CodeSystem regressions", () => {
  it("validates installed CodeSystem displays below complex datatype boundaries", async () => {
    mockStructureDef.type = "Practitioner";
    mockStructureDef.snapshot!.element = [
      {
        path: "Practitioner.identifier",
        min: 0,
        max: "*",
        type: [{ code: "Identifier" }],
      } as ElementDefinition,
    ];
    mockContext.resource = {
      resourceType: "Practitioner",
      identifier: [
        {
          type: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "MD",
                display: "Medical Licence number",
              },
            ],
          },
          value: "M35106",
        },
      ],
    };
    validatorInstance.validateCodeInLocalCodeSystemOnly.mockResolvedValue({
      valid: false,
      reason: "display-mismatch",
      display: "Medical License number",
      message:
        "Wrong Display Name 'Medical Licence number' for " +
        "http://terminology.hl7.org/CodeSystem/v2-0203#MD",
      issues: [
        {
          severity: "error",
          code: "invalid-display",
          message:
            "Wrong Display Name 'Medical Licence number' for " +
            "http://terminology.hl7.org/CodeSystem/v2-0203#MD",
        },
      ],
    });

    const issues = await executor.validate(mockContext);

    expect(
      validatorInstance.validateCodeInLocalCodeSystemOnly,
    ).toHaveBeenCalledWith(
      "MD",
      "http://terminology.hl7.org/CodeSystem/v2-0203",
      "Medical Licence number",
      "R4",
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "terminology-display-mismatch",
        path: "Practitioner.identifier[0].type.coding[0].display",
      }),
    );
  });

  it("rejects the undefined legacy Observation category URL and suggests the canonical CodeSystem", async () => {
    mockStructureDef.snapshot!.element = [
      {
        path: "Observation.category",
        min: 0,
        max: "*",
        type: [{ code: "CodeableConcept" }],
      } as ElementDefinition,
    ];
    mockContext.resource = {
      resourceType: "Observation",
      category: [
        {
          coding: [
            {
              system: "http://hl7.org/fhir/observation-category",
              code: "vital-signs",
            },
          ],
        },
      ],
    };
    mockContext.getValueAtPath = (resource: any, path: string) => {
      if (path === "Observation.category") return resource.category;
      return undefined;
    };

    const issues = await executor.validate(mockContext);

    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "terminology-code-system-canonical-mismatch",
        path: "Observation.category[0].coding[0].system",
        details: expect.objectContaining({
          suggestedSystem:
            "http://terminology.hl7.org/CodeSystem/observation-category",
        }),
      }),
    );
  });

  it("should return empty array for valid terminology bindings", async () => {
    // Spy on the validator instance's validateBinding method
    const validateBindingSpy = vi
      .spyOn(validatorInstance, "validateBinding")
      .mockResolvedValue([]);

    const issues = await executor.validate(mockContext);

    expect(issues).toEqual([]);
    validateBindingSpy.mockRestore();
  });

  it("does not report non-required binding warnings for codes fixed by the same profile element", async () => {
    mockStructureDef.url =
      "http://example.org/StructureDefinition/fixed-vital-code";
    mockStructureDef.snapshot!.element = [
      { path: "Observation", min: 1, max: "1" } as ElementDefinition,
      {
        id: "Observation.code",
        path: "Observation.code",
        min: 1,
        max: "1",
        type: [{ code: "CodeableConcept" }],
        binding: {
          strength: "extensible",
          valueSet: "http://hl7.org/fhir/ValueSet/observation-vitalsignresult",
        },
        patternCodeableConcept: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8289-1",
            },
          ],
        },
      } as ElementDefinition,
    ];
    mockContext.resource.code = {
      coding: [
        {
          system: "http://loinc.org",
          code: "8289-1",
          display: "Head Occipital-frontal circumference Percentile",
        },
      ],
    };
    const validateBindingSpy = vi
      .spyOn(validatorInstance, "validateBinding")
      .mockResolvedValue([
        {
          id: "binding-warning",
          aspect: "terminology",
          severity: "warning",
          code: "terminology-binding-extensible",
          message: "Code is not in extensible ValueSet",
          path: "Observation.code",
          timestamp: new Date(),
        },
      ]);

    const issues = await executor.validate(mockContext);

    expect(
      issues.some((issue) => issue.code === "terminology-binding-extensible"),
    ).toBe(false);
    expect(validateBindingSpy).not.toHaveBeenCalledWith(
      mockContext.resource.code,
      expect.objectContaining({ strength: "extensible" }),
      "Observation.code",
      expect.any(Object),
    );
    validateBindingSpy.mockRestore();
  });

  it("should skip elements without bindings", async () => {
    mockStructureDef.snapshot!.element = [
      {
        path: "Observation.id",
        min: 0,
        max: "1",
      } as ElementDefinition,
    ];

    const issues = await executor.validate(mockContext);
    expect(issues).toEqual([]);
  });

  it("should validate elements with bindings", async () => {
    // Create a context with only one binding to test single validation
    const singleBindingContext = {
      ...mockContext,
      structureDef: {
        ...mockStructureDef,
        snapshot: {
          element: [
            {
              path: "Observation.status",
              min: 1,
              max: "1",
              type: [{ code: "code" }],
              binding: {
                strength: "required",
                valueSet: "http://hl7.org/fhir/ValueSet/observation-status",
              },
            } as ElementDefinition,
          ],
        },
      },
      resource: {
        resourceType: "Observation",
        id: "test-001",
        status: "final",
      },
    };

    const mockIssues: ValidationIssue[] = [
      {
        id: "terminology-error-1",
        aspect: "terminology",
        severity: "error",
        code: "binding-violation",
        message: "Code not in value set",
        path: "Observation.status",
        timestamp: new Date(),
      },
    ];

    const executorWithMock = new TerminologyExecutor(validatorInstance);
    validatorInstance.validateBinding.mockResolvedValue(mockIssues);

    const issues = await executorWithMock.validate(singleBindingContext);
    expect(issues).toEqual(mockIssues);
  });

  it("does not report required binding errors for unrelated value set slice roots", async () => {
    const conditionProfile: StructureDefinition = {
      id: "condition-profile",
      url: "http://example.org/StructureDefinition/condition-profile",
      type: "Condition",
      snapshot: {
        element: [
          {
            id: "Condition.category",
            path: "Condition.category",
            min: 1,
            max: "*",
            slicing: {
              discriminator: [{ type: "value", path: "$this" }],
              rules: "open",
            },
          } as ElementDefinition,
          {
            id: "Condition.category:us-core",
            path: "Condition.category",
            sliceName: "us-core",
            min: 1,
            max: "*",
            binding: {
              strength: "required",
              valueSet:
                "http://hl7.org/fhir/us/core/ValueSet/us-core-problem-or-health-concern",
            },
          } as ElementDefinition,
          {
            id: "Condition.category:screening-assessment",
            path: "Condition.category",
            sliceName: "screening-assessment",
            min: 0,
            max: "*",
            binding: {
              strength: "required",
              valueSet:
                "http://hl7.org/fhir/us/core/ValueSet/us-core-simple-observation-category",
            },
          } as ElementDefinition,
          {
            id: "Condition.category:sdoh",
            path: "Condition.category",
            sliceName: "sdoh",
            min: 0,
            max: "*",
            patternCodeableConcept: {
              coding: [
                {
                  system:
                    "http://terminology.hl7.org/CodeSystem/condition-category",
                  code: "sdoh",
                },
              ],
            },
          } as ElementDefinition,
        ],
      },
    };
    const resource = {
      resourceType: "Condition",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "problem-list-item",
            },
          ],
        },
      ],
    };
    const context: TerminologyValidationContext = {
      resource,
      structureDef: conditionProfile,
      getValueAtPath: (input: any, path: string) => {
        if (path === "Condition.category") return input.category;
        return undefined;
      },
    };
    validatorInstance.validateBinding.mockImplementation(
      async (_value: unknown, binding: any) => {
        if (
          binding.valueSet ===
          "http://hl7.org/fhir/us/core/ValueSet/us-core-problem-or-health-concern"
        ) {
          return [];
        }
        return [
          {
            id: "screening-binding",
            aspect: "terminology",
            severity: "error",
            code: "terminology-binding-required",
            message: "Code not in screening-assessment value set",
            path: "Condition.category",
            timestamp: new Date(),
          } satisfies ValidationIssue,
        ];
      },
    );

    const issues = await executor.validate(context);

    expect(issues).toEqual([]);
    expect(validatorInstance.validateBinding).toHaveBeenCalledTimes(2);
  });

  it("keeps required binding errors for required value set slice roots", async () => {
    const conditionProfile: StructureDefinition = {
      id: "condition-profile",
      url: "http://example.org/StructureDefinition/condition-profile",
      type: "Condition",
      snapshot: {
        element: [
          {
            id: "Condition.category",
            path: "Condition.category",
            min: 1,
            max: "*",
            slicing: {
              discriminator: [{ type: "value", path: "$this" }],
              rules: "open",
            },
          } as ElementDefinition,
          {
            id: "Condition.category:us-core",
            path: "Condition.category",
            sliceName: "us-core",
            min: 1,
            max: "*",
            binding: {
              strength: "required",
              valueSet:
                "http://hl7.org/fhir/us/core/ValueSet/us-core-problem-or-health-concern",
            },
          } as ElementDefinition,
          {
            id: "Condition.category:screening-assessment",
            path: "Condition.category",
            sliceName: "screening-assessment",
            min: 0,
            max: "*",
            binding: {
              strength: "required",
              valueSet:
                "http://hl7.org/fhir/us/core/ValueSet/us-core-simple-observation-category",
            },
          } as ElementDefinition,
        ],
      },
    };
    const resource = {
      resourceType: "Condition",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "encounter-diagnosis",
            },
          ],
        },
      ],
    };
    const context: TerminologyValidationContext = {
      resource,
      structureDef: conditionProfile,
      getValueAtPath: (input: any, path: string) => {
        if (path === "Condition.category") return input.category;
        return undefined;
      },
    };
    validatorInstance.validateBinding.mockImplementation(
      async (_value: unknown, binding: any) => [
        {
          id: binding.valueSet,
          aspect: "terminology",
          severity: "error",
          code: "terminology-binding-required",
          message: `Code not in ${binding.valueSet}`,
          path: "Condition.category",
          timestamp: new Date(),
        } satisfies ValidationIssue,
      ],
    );

    const issues = await executor.validate(context);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        code: "terminology-binding-required",
        message: expect.stringContaining("us-core-problem-or-health-concern"),
      }),
    );
  });
});
