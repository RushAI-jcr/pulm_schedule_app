import { describe, expect, it } from "vitest";
import { runAutoFill } from "../convex/lib/autoFillSolver";
import { DEFAULT_AUTO_FILL_CONFIG } from "../convex/lib/autoFill";
import type { Availability } from "../convex/lib/masterCalendarAssignments";
import type { RotationPreference } from "../convex/lib/autoFill";

function makeWeeks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `w${i + 1}`,
    weekNumber: i + 1,
  }));
}

function makeRotations(count: number, cftePerWeek = 0.02) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `r${i + 1}`,
    name: `Rotation ${i + 1}`,
    abbreviation: `ROT${i + 1}`,
    cftePerWeek,
    minStaff: 1,
    maxConsecutiveWeeks: 4,
    sortOrder: i + 1,
    isActive: true,
  }));
}

function makePhysicians(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `p${i + 1}`,
    initials: `P${i + 1}`,
    isActive: true,
  }));
}

function makeAssignments(weeks: { _id: string }[], rotations: { _id: string }[]) {
  const assignments = [];
  for (const week of weeks) {
    for (const rotation of rotations) {
      assignments.push({
        _id: `a-${week._id}-${rotation._id}`,
        weekId: week._id,
        rotationId: rotation._id,
        physicianId: null,
        assignmentSource: null,
      });
    }
  }
  return assignments;
}

describe("runAutoFill", () => {
  it("fills empty cells with eligible physicians", () => {
    const weeks = makeWeeks(4);
    const rotations = makeRotations(2);
    const physicians = makePhysicians(3);
    const assignments = makeAssignments(weeks, rotations);

    const targetCfteMap = new Map(physicians.map((p) => [p._id, 0.5]));
    const clinicCfteMap = new Map<string, number>();
    const availabilityMap = new Map<string, Map<string, Availability>>();
    const preferenceMap = new Map<string, Map<string, RotationPreference>>();

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap,
      preferenceMap,
      targetCfteMap,
      clinicCfteMap,
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // Should fill all 8 cells (4 weeks x 2 rotations)
    expect(result.assignments.length).toBe(8);
    expect(result.unfilled.length).toBe(0);
    expect(result.metrics.filledCells).toBe(8);
    expect(result.metrics.unfilledCells).toBe(0);
  });

  it("respects red week blocks", () => {
    const weeks = makeWeeks(2);
    const rotations = makeRotations(1);
    const physicians = makePhysicians(1);
    const assignments = makeAssignments(weeks, rotations);

    const availabilityMap = new Map([
      ["p1", new Map([["w1", "red" as Availability]])],
    ]);

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap,
      preferenceMap: new Map(),
      targetCfteMap: new Map([["p1", 1.0]]),
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // Should only fill w2, not w1 (red blocked)
    expect(result.assignments.length).toBe(1);
    expect(result.assignments[0].weekId).toBe("w2");
  });

  it("prevents same-week double-booking", () => {
    const weeks = makeWeeks(1);
    const rotations = makeRotations(2);
    const physicians = makePhysicians(1);
    const assignments = makeAssignments(weeks, rotations);

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map(),
      preferenceMap: new Map(),
      targetCfteMap: new Map([["p1", 1.0]]),
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // Only 1 physician for 2 rotation slots in same week: only 1 can be filled
    expect(result.assignments.length).toBe(1);
    expect(result.unfilled.length).toBe(1);
  });

  it("respects cFTE headroom limits", () => {
    const weeks = makeWeeks(10);
    const rotations = makeRotations(1, 0.10); // 0.10 per week
    const physicians = makePhysicians(1);
    const assignments = makeAssignments(weeks, rotations);

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map(),
      preferenceMap: new Map(),
      targetCfteMap: new Map([["p1", 0.30]]), // Only room for 3 weeks
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // Should stop filling once cFTE is exhausted (3 weeks at 0.10 each = 0.30)
    expect(result.assignments.length).toBe(3);
  });

  it("preserves manually anchored assignments", () => {
    const weeks = makeWeeks(2);
    const rotations = makeRotations(1);
    const physicians = makePhysicians(2);

    // p1 is manually assigned to w1
    const assignments = [
      {
        _id: "a-w1-r1",
        weekId: "w1",
        rotationId: "r1",
        physicianId: "p1",
        assignmentSource: "manual",
      },
      {
        _id: "a-w2-r1",
        weekId: "w2",
        rotationId: "r1",
        physicianId: null,
        assignmentSource: null,
      },
    ];

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map(),
      preferenceMap: new Map(),
      targetCfteMap: new Map([
        ["p1", 0.5],
        ["p2", 0.5],
      ]),
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // Only w2 should be filled (w1 is already manually assigned)
    expect(result.assignments.length).toBe(1);
    expect(result.assignments[0].weekId).toBe("w2");
  });

  it("produces deterministic results for same fiscal year ID", () => {
    const weeks = makeWeeks(8);
    const rotations = makeRotations(2);
    const physicians = makePhysicians(4);
    const assignments = makeAssignments(weeks, rotations);

    const params = {
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map<string, Map<string, Availability>>(),
      preferenceMap: new Map<string, Map<string, RotationPreference>>(),
      targetCfteMap: new Map(physicians.map((p) => [p._id, 1.0])),
      clinicCfteMap: new Map<string, number>(),
      holidayWeeks: new Map<string, string[]>(),
      parityScores: new Map<string, Map<string, number>>(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy-deterministic",
    };

    const result1 = runAutoFill(params);
    const result2 = runAutoFill(params);

    expect(result1.assignments.map((a) => `${a.weekId}:${a.rotationId}:${a.physicianId}`))
      .toEqual(result2.assignments.map((a) => `${a.weekId}:${a.rotationId}:${a.physicianId}`));
  });

  it("avoids rotations marked as avoid", () => {
    const weeks = makeWeeks(1);
    const rotations = makeRotations(1);
    const physicians = makePhysicians(1);
    const assignments = makeAssignments(weeks, rotations);

    const preferenceMap = new Map([
      ["p1", new Map([["r1", { preferenceRank: null, avoid: true, deprioritize: false }]])],
    ]);

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map(),
      preferenceMap,
      targetCfteMap: new Map([["p1", 1.0]]),
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    // p1 avoids r1 -> cell unfilled
    expect(result.assignments.length).toBe(0);
    expect(result.unfilled.length).toBe(1);
  });

  it("returns meaningful metrics", () => {
    const weeks = makeWeeks(4);
    const rotations = makeRotations(2);
    const physicians = makePhysicians(3);
    const assignments = makeAssignments(weeks, rotations);

    const result = runAutoFill({
      weeks,
      rotations,
      physicians,
      existingAssignments: assignments,
      availabilityMap: new Map(),
      preferenceMap: new Map(),
      targetCfteMap: new Map(physicians.map((p) => [p._id, 1.0])),
      clinicCfteMap: new Map(),
      holidayWeeks: new Map(),
      parityScores: new Map(),
      config: DEFAULT_AUTO_FILL_CONFIG,
      fiscalYearId: "fy1",
    });

    expect(result.metrics.totalCells).toBe(8);
    expect(result.metrics.avgScore).toBeGreaterThan(0);
    expect(result.metrics.preferencesSatisfied).toBeGreaterThanOrEqual(0);
    expect(result.metrics.workloadStdDev).toBeGreaterThanOrEqual(0);
  });
});
