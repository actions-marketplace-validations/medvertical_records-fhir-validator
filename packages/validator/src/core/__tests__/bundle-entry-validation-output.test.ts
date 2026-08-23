import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidationIssue } from "../../types";
import { logger } from "../../logger";
import {
  createBundleEntryValidationFailureIssue,
  mapBundleEntryIssues,
} from "../bundle-entry-validation-output";

vi.mock("../../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

function issue(overrides: Partial<ValidationIssue> = {}): ValidationIssue {
  return {
    aspect: "structure",
    severity: "error",
    code: "invalid",
    message: "Invalid value",
    path: "Observation.status",
    expression: "Observation.status",
    ...overrides,
  };
}

describe("bundle entry validation output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses embedded metadata noise, deduplicates, and rewrites paths once", () => {
    const original = issue();
    const duplicate = issue({ expression: "Observation.other" });
    const suppressed = issue({
      aspect: "metadata",
      code: "required-metadata-missing-versionId",
      message: "Missing versionId",
      path: "Observation.meta.versionId",
    });

    const mapped = mapBundleEntryIssues([original, duplicate, suppressed], {
      entryIndex: 2,
      resourceType: "Observation",
      resourceId: "obs-1",
    });

    expect(mapped.childIssues).toEqual([original]);
    expect(mapped.parentIssues).toEqual([
      {
        ...original,
        path: "Bundle.entry[2].resource/*Observation/obs-1*/.status",
        expression: "Bundle.entry[2].resource/*Observation/obs-1*/.status",
      },
    ]);
  });

  it("adds bundle-unit details only when requested by multi-aspect output", () => {
    const mapped = mapBundleEntryIssues(
      [
        issue({
          path: "Observation",
          expression: undefined,
          details: "source details",
        }),
      ],
      {
        entryIndex: 0,
        resourceType: "Observation",
        resourceId: "obs-1",
        includeBundleUnitDetails: true,
      },
    );

    expect(mapped.childIssues[0]?.details).toBe("source details");
    expect(mapped.parentIssues[0]).toEqual(
      expect.objectContaining({
        path: "Bundle.entry[0].resource/*Observation/obs-1*/",
        details: {
          originalDetails: "source details",
          bundleUnit: {
            entryIndex: 0,
            resourceType: "Observation",
            resourceId: "obs-1",
            reference: "Observation/obs-1",
          },
        },
      }),
    );
  });

  it("preserves suppressed issues when building immutable evidence", () => {
    const suppressed = issue({
      aspect: "metadata",
      code: "required-metadata-missing-versionId",
      message: "Missing versionId",
      path: "Observation.meta.versionId",
    });

    const mapped = mapBundleEntryIssues([suppressed], {
      entryIndex: 1,
      resourceType: "Observation",
      includeSuppressed: true,
    });

    expect(mapped.childIssues).toEqual([suppressed]);
    expect(mapped.parentIssues).toHaveLength(1);
  });

  it("creates a stable failure issue without exception-derived content", () => {
    const failure = createBundleEntryValidationFailureIssue(3, "Patient");

    expect(failure).toEqual(
      expect.objectContaining({
        aspect: "profile",
        code: "validation-error",
        message:
          "Bundle entry[3] validation could not be completed because the validator encountered an operational error.",
        path: "Bundle.entry[3].resource",
        details: {
          entryIndex: 3,
          resourceType: "Patient",
        },
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "[RecordsValidator] Bundle entry validation failed",
      { entryIndex: 3, entryResourceType: "Patient" },
    );
  });
});
