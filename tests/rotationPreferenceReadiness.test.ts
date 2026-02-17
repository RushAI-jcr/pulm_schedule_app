import { describe, expect, it } from "vitest";
import {
  REQUIRED_INPATIENT_ROTATION_NAMES,
  getMissingActiveRotationIds,
  getRotationConfigurationIssues,
} from "../convex/lib/rotationPreferenceReadiness";

describe("rotation preference readiness helpers", () => {
  it("accepts canonical inpatient rotation names", () => {
    const issues = getRotationConfigurationIssues([...REQUIRED_INPATIENT_ROTATION_NAMES]);

    expect(issues.isValid).toBe(true);
    expect(issues.missingRequiredNames).toEqual([]);
    expect(issues.unexpectedNames).toEqual([]);
  });

  it("flags missing and unexpected active rotations", () => {
    const issues = getRotationConfigurationIssues([
      "Pulm",
      "MICU 1",
      "MICU 2",
      "AICU",
      "LTAC",
      "ROPH",
      "Thoracic",
    ]);

    expect(issues.isValid).toBe(false);
    expect(issues.missingRequiredNames).toEqual(["IP", "PFT"]);
    expect(issues.unexpectedNames).toEqual(["Thoracic"]);
  });

  it("detects missing explicit preference rows for active rotations", () => {
    const missing = getMissingActiveRotationIds({
      activeRotationIds: ["r1", "r2", "r3", "r4"],
      configuredRotationIds: ["r1", "r3"],
    });

    expect(missing).toEqual(["r2", "r4"]);
  });
});

