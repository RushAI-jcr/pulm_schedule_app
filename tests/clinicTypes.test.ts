import { describe, expect, it } from "vitest";
import {
  hasDuplicateClinicTypeName,
  normalizeClinicTypeName,
} from "../convex/lib/clinicTypes";

describe("clinic type helpers", () => {
  it("normalizes extra whitespace", () => {
    expect(normalizeClinicTypeName("  Pulmonary   South   Loop ")).toBe("Pulmonary South Loop");
  });

  it("detects duplicates case-insensitively", () => {
    expect(
      hasDuplicateClinicTypeName(
        ["Pulmonary RAB", "Sleep Clinic"],
        " sleep   clinic ",
      ),
    ).toBe(true);
  });

  it("returns false when not duplicated", () => {
    expect(
      hasDuplicateClinicTypeName(
        ["Pulmonary RAB", "Sleep Clinic"],
        "CF Clinic",
      ),
    ).toBe(false);
  });
});
