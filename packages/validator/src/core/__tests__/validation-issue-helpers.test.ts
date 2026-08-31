import { describe, expect, it } from "vitest";
import {
  createValidationErrorIssue,
  createValidationInfoIssue,
  createValidationWarningIssue,
} from "../validation-utils";

describe("core issue helpers", () => {
  it("creates deterministic IDs while preserving the lean engine issue shape", () => {
    const first = createValidationErrorIssue(
      "profile",
      "profile-not-found",
      "Profile was not found",
      { profile: "https://example.org/Profile" },
      "meta.profile",
    );
    const second = createValidationErrorIssue(
      "profile",
      "profile-not-found",
      "Profile was not found",
      { profile: "https://example.org/Profile" },
      "meta.profile",
    );

    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      aspect: "profile",
      severity: "error",
      code: "profile-not-found",
      path: "meta.profile",
      details: { profile: "https://example.org/Profile" },
    });
    expect(first.timestamp).toBeInstanceOf(Date);
  });

  it("includes the path and details in issue identity", () => {
    const atSubject = createValidationErrorIssue(
      "reference",
      "internal-error",
      "Resolution failed",
      { reference: "Patient/example" },
      "subject",
    );
    const atPerformer = createValidationErrorIssue(
      "reference",
      "internal-error",
      "Resolution failed",
      { reference: "Patient/example" },
      "performer[0]",
    );

    expect(atSubject.id).not.toBe(atPerformer.id);
  });

  it("handles cyclic details and keeps information severity", () => {
    const details: Record<string, unknown> = {};
    details.self = details;

    const issueResult = createValidationInfoIssue(
      "profile",
      "profile-not-found",
      "Profile unavailable",
      details,
    );

    expect(issueResult).toMatchObject({
      severity: "info",
      details,
    });
  });

  it("creates warning issues through the same identity policy", () => {
    const warning = createValidationWarningIssue(
      "profile",
      "profile-not-resolved",
      "Profile unavailable",
      { profile: "https://example.org/Profile" },
      "meta.profile",
    );

    expect(warning).toMatchObject({
      severity: "warning",
      path: "meta.profile",
    });
  });
});
