import { describe, expect, it } from "vitest";
import { dedupeIssues } from "../validation-utils";
import { validationIssue as issue } from "./validation-issue-test-builders";

describe("required-binding issue dedupe", () => {
  it("keeps the specific terminology error over the generic profile copy", () => {
    const path = "Procedure.statusReason.coding[0]";
    const valueSet =
      "https://www.medizininformatik-initiative.de/fhir/ext/modul-mtb/ValueSet/mii-vs-mtb-therapiestatusgrund";
    const terminologyIssue = issue({
      aspect: "terminology",
      code: "terminology-binding-required-code",
      severity: "error",
      path,
      resourceType: "Procedure",
      message: `Code 'regular-completion' is not in value set '${valueSet}'`,
      details: { valueSet, code: "regular-completion" },
    });
    const genericProfileIssue = issue({
      aspect: "structural",
      code: "profile-required-binding-violation",
      severity: "error",
      path,
      resourceType: "Procedure",
      message: `Value does not satisfy required binding to ${valueSet}`,
      details: { valueSet, codingCount: 1 },
    });

    expect(dedupeIssues([genericProfileIssue, terminologyIssue])).toEqual([
      terminologyIssue,
    ]);
  });

  it("keeps required-binding errors for different value sets at the same path", () => {
    const path = "Observation.code";
    const profileIssue = issue({
      aspect: "structural",
      code: "profile-required-binding-violation",
      severity: "error",
      path,
      resourceType: "Observation",
      message:
        "Value does not satisfy required binding to https://example.test/vs/a",
      details: { valueSet: "https://example.test/vs/a" },
    });
    const terminologyIssue = issue({
      aspect: "terminology",
      code: "terminology-binding-required",
      severity: "error",
      path,
      resourceType: "Observation",
      message: "Code x is not in value set https://example.test/vs/b",
      details: { valueSet: "https://example.test/vs/b", code: "x" },
    });

    expect(dedupeIssues([profileIssue, terminologyIssue])).toHaveLength(2);
  });
});
