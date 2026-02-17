import { describe, expect, it } from "vitest";
import {
  doesImportDoctorTokenMatch,
  getWeekCoverageDiff,
  mapUploadedWeeksToFiscalWeeks,
  normalizeImportFiscalYearLabel,
} from "../convex/lib/scheduleImport";

describe("schedule import validation helpers", () => {
  it("normalizes fiscal year labels", () => {
    expect(normalizeImportFiscalYearLabel("fy 27")).toBe("FY27");
    expect(normalizeImportFiscalYearLabel("FY27")).toBe("FY27");
    expect(normalizeImportFiscalYearLabel("  FY 2027  ")).toBe("FY2027");
  });

  it("matches doctor token against last name or initials", () => {
    const target = { lastName: "Rojas", initials: "JCR" };

    expect(doesImportDoctorTokenMatch("rojas", target)).toBe(true);
    expect(doesImportDoctorTokenMatch("J C R", target)).toBe(true);
    expect(doesImportDoctorTokenMatch("smith", target)).toBe(false);
  });

  it("reports missing and unknown week coverage", () => {
    const diff = getWeekCoverageDiff(
      ["2026-06-29", "2026-07-06", "2026-07-13"],
      ["2026-06-29", "2026-07-06", "2026-08-01"],
    );

    expect(diff.missing).toEqual(["2026-07-13"]);
    expect(diff.unknown).toEqual(["2026-08-01"]);
    expect(diff.duplicates).toEqual([]);
  });

  it("reports duplicate week starts", () => {
    const diff = getWeekCoverageDiff(
      ["2026-06-29", "2026-07-06"],
      ["2026-06-29", "2026-06-29"],
    );

    expect(diff.duplicates).toEqual(["2026-06-29"]);
    expect(diff.missing).toEqual(["2026-07-06"]);
  });

  it("maps uploaded weeks to fiscal week ids", () => {
    const mapped = mapUploadedWeeksToFiscalWeeks({
      expectedWeeks: [
        { _id: "w1", startDate: "2026-06-29" },
        { _id: "w2", startDate: "2026-07-06" },
      ],
      uploadedWeeks: [
        { weekStart: "2026-06-29", availability: "green" },
        { weekStart: "2026-07-06", availability: "unset" },
      ],
    });

    expect(mapped).toEqual([
      { weekId: "w1", availability: "green" },
      { weekId: "w2", availability: "unset" },
    ]);
  });
});
