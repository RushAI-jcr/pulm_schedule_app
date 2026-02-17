import { describe, expect, it } from "vitest";
import { getNextMasterCalendarVersion } from "../convex/lib/masterCalendar";
import {
  formatRotationPreferenceGateMessage,
  formatUnstaffedCellError,
} from "../convex/lib/masterCalendarPublish";

describe("master calendar versioning", () => {
  it("starts at version 1 when none exist", () => {
    expect(getNextMasterCalendarVersion([])).toBe(1);
  });

  it("increments from highest existing version", () => {
    expect(getNextMasterCalendarVersion([1, 2, 3])).toBe(4);
    expect(getNextMasterCalendarVersion([2, 5, 3])).toBe(6);
  });
});

describe("master calendar publish safeguards", () => {
  it("formats readiness gate errors with physician blockers", () => {
    const message = formatRotationPreferenceGateMessage({
      rotationConfigurationIssues: {
        isValid: true,
        missingRequiredNames: [],
        unexpectedNames: [],
      },
      physicianIssues: [
        {
          physicianId: "p1",
          initials: "JCR",
          name: "John Carter",
          blockingReasons: ["Awaiting admin approval."],
        },
      ],
    });

    expect(message).toContain("Calendar mapping is blocked");
    expect(message).toContain("Blocking physicians: JCR (John Carter): Awaiting admin approval.");
  });

  it("formats unstaffed-cell publish errors with sample gaps", () => {
    const message = formatUnstaffedCellError([
      { weekNumber: 5, rotationName: "MICU 1" },
      { weekNumber: 6, rotationName: "LTAC" },
    ]);

    expect(message).toContain("Cannot publish");
    expect(message).toContain("Week 5 MICU 1");
    expect(message).toContain("Week 6 LTAC");
  });
});
