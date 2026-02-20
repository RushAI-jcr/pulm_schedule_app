import { describe, expect, it } from "vitest";
import { runAutoFill } from "../convex/lib/autoFillSolver";
import { DEFAULT_AUTO_FILL_CONFIG } from "../convex/lib/autoFill";
import type { Availability } from "../convex/lib/masterCalendarAssignments";
import type { RotationPreference } from "../convex/lib/autoFill";

function makeWeeks() {
  return [
    { _id: "w1", weekNumber: 1, startDate: "2026-07-01" },
    { _id: "w2", weekNumber: 2, startDate: "2026-07-08" },
    { _id: "w3", weekNumber: 3, startDate: "2026-07-15" },
  ];
}

function makeRotations() {
  return [
    {
      _id: "r1",
      name: "MICU 1",
      abbreviation: "MICU1",
      cftePerWeek: 0.1,
      minStaff: 1,
      maxConsecutiveWeeks: 3,
      sortOrder: 1,
      isActive: true,
    },
    {
      _id: "r2",
      name: "PFT",
      abbreviation: "PFT",
      cftePerWeek: 0.1,
      minStaff: 1,
      maxConsecutiveWeeks: 3,
      sortOrder: 2,
      isActive: true,
    },
  ];
}

function makeAssignments() {
  return [
    { _id: "a1", weekId: "w1", rotationId: "r1", physicianId: null, assignmentSource: null },
    { _id: "a2", weekId: "w1", rotationId: "r2", physicianId: null, assignmentSource: null },
    { _id: "a3", weekId: "w2", rotationId: "r1", physicianId: null, assignmentSource: null },
    { _id: "a4", weekId: "w2", rotationId: "r2", physicianId: null, assignmentSource: null },
    { _id: "a5", weekId: "w3", rotationId: "r1", physicianId: null, assignmentSource: null },
    { _id: "a6", weekId: "w3", rotationId: "r2", physicianId: null, assignmentSource: null },
  ];
}

describe("runAutoFill physician-only mode behavior", () => {
  it("does not double-book physician in the same week and enforces cFTE hard limit", () => {
    const result = runAutoFill({
      weeks: makeWeeks(),
      rotations: makeRotations(),
      physicians: [{ _id: "p1", initials: "P1", isActive: true }],
      existingAssignments: makeAssignments(),
      availabilityMap: new Map<string, Map<string, Availability>>([
        ["p1", new Map([["w1", "green"], ["w2", "green"], ["w3", "green"]])],
      ]),
      preferenceMap: new Map<string, Map<string, RotationPreference>>(),
      targetCfteMap: new Map([["p1", 0.2]]),
      clinicCfteMap: new Map([["p1", 0]]),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy27",
    });

    expect(result.assignments.length).toBe(2);
    const weekCounts = new Map<string, number>();
    for (const assignment of result.assignments) {
      weekCounts.set(assignment.weekId, (weekCounts.get(assignment.weekId) ?? 0) + 1);
    }
    expect([...weekCounts.values()].every((count) => count <= 1)).toBe(true);
  });

  it("respects explicit avoid preferences in physician-only mode", () => {
    const result = runAutoFill({
      weeks: makeWeeks(),
      rotations: makeRotations(),
      physicians: [{ _id: "p1", initials: "P1", isActive: true }],
      existingAssignments: makeAssignments(),
      availabilityMap: new Map<string, Map<string, Availability>>([
        ["p1", new Map([["w1", "green"], ["w2", "green"], ["w3", "green"]])],
      ]),
      preferenceMap: new Map([
        ["p1", new Map([["r1", { preferenceRank: null, avoid: true, deprioritize: false }]])],
      ]),
      targetCfteMap: new Map([["p1", 0.3]]),
      clinicCfteMap: new Map([["p1", 0]]),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy27",
    });

    expect(result.assignments.every((assignment) => assignment.rotationId !== "r1")).toBe(true);
  });
});
