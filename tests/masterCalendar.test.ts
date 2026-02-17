import { describe, expect, it } from "vitest";
import { getNextMasterCalendarVersion } from "../convex/lib/masterCalendar";

describe("master calendar versioning", () => {
  it("starts at version 1 when none exist", () => {
    expect(getNextMasterCalendarVersion([])).toBe(1);
  });

  it("increments from highest existing version", () => {
    expect(getNextMasterCalendarVersion([1, 2, 3])).toBe(4);
    expect(getNextMasterCalendarVersion([2, 5, 3])).toBe(6);
  });
});
