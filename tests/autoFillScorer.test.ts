import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../convex/lib/autoFillScorer";
import { DEFAULT_AUTO_FILL_CONFIG } from "../convex/lib/autoFill";

function makeContext(overrides?: Partial<Parameters<typeof scoreCandidate>[0]["context"]>) {
  return {
    config: DEFAULT_AUTO_FILL_CONFIG,
    parityScores: new Map<string, Map<string, number>>(),
    weekCountByPhysician: new Map<string, number>(),
    rotationCountByPhysician: new Map<string, Map<string, number>>(),
    lastRotationWeekByPhysician: new Map<string, Map<string, number>>(),
    totalPhysicians: 8,
    totalWeeksToFill: 416,
    targetCfteMap: new Map<string, number>(),
    avgTargetCfte: 0.5,
    ...overrides,
  };
}

describe("scoreCandidate", () => {
  it("scores green availability higher than yellow", () => {
    const base = {
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 1, holidayNames: [] },
      preferences: { preferenceRank: null, deprioritize: false },
      context: makeContext(),
    };

    const green = scoreCandidate({
      ...base,
      physician: { physicianId: "p1", availability: "green", headroom: 0.5 },
    });
    const yellow = scoreCandidate({
      ...base,
      physician: { physicianId: "p1", availability: "yellow", headroom: 0.5 },
    });

    expect(green.totalScore).toBeGreaterThan(yellow.totalScore);
  });

  it("applies deprioritize penalty", () => {
    const base = {
      physician: { physicianId: "p1", availability: "green" as const, headroom: 0.5 },
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 1, holidayNames: [] },
      context: makeContext(),
    };

    const normal = scoreCandidate({
      ...base,
      preferences: { preferenceRank: 1, deprioritize: false },
    });
    const deprioritized = scoreCandidate({
      ...base,
      preferences: { preferenceRank: 1, deprioritize: true },
    });

    expect(normal.totalScore).toBeGreaterThan(deprioritized.totalScore);
    expect(deprioritized.breakdown.deprioritize).toBe(0);
    expect(normal.breakdown.deprioritize).toBe(100);
  });

  it("favors physicians with fewer assigned weeks (workload spread)", () => {
    const weekCounts = new Map([
      ["p1", 20], // many weeks assigned
      ["p2", 2],  // few weeks assigned
    ]);
    const targetCfteMap = new Map([
      ["p1", 0.5],
      ["p2", 0.5],
    ]);

    const base = {
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 30, holidayNames: [] },
      preferences: { preferenceRank: null, deprioritize: false },
      context: makeContext({ weekCountByPhysician: weekCounts, targetCfteMap, avgTargetCfte: 0.5 }),
    };

    const scoredBusy = scoreCandidate({
      ...base,
      physician: { physicianId: "p1", availability: "green", headroom: 0.5 },
    });
    const scoredFree = scoreCandidate({
      ...base,
      physician: { physicianId: "p2", availability: "green", headroom: 0.5 },
    });

    expect(scoredFree.breakdown.workloadSpread).toBeGreaterThan(scoredBusy.breakdown.workloadSpread);
  });

  it("gives rotation variety bonus for new rotations", () => {
    const rotCounts = new Map([
      ["p1", new Map([["r1", 10]])],
      ["p2", new Map<string, number>()],
    ]);
    const weekCounts = new Map([
      ["p1", 10],
      ["p2", 0],
    ]);

    const base = {
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 30, holidayNames: [] },
      preferences: { preferenceRank: null, deprioritize: false },
      context: makeContext({
        rotationCountByPhysician: rotCounts,
        weekCountByPhysician: weekCounts,
      }),
    };

    const concentrated = scoreCandidate({
      ...base,
      physician: { physicianId: "p1", availability: "green", headroom: 0.5 },
    });
    const fresh = scoreCandidate({
      ...base,
      physician: { physicianId: "p2", availability: "green", headroom: 0.5 },
    });

    expect(fresh.breakdown.rotationVariety).toBeGreaterThan(concentrated.breakdown.rotationVariety);
  });

  it("returns score between 0 and 100", () => {
    const result = scoreCandidate({
      physician: { physicianId: "p1", availability: "green", headroom: 0.5 },
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 1, holidayNames: [] },
      preferences: { preferenceRank: 1, deprioritize: false },
      context: makeContext(),
    });

    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("holiday parity: penalizes physician who worked this holiday last year", () => {
    const parityScores = new Map([
      ["p1", new Map([["thanksgiving day", -50]])],
      ["p2", new Map([["thanksgiving day", 30]])],
    ]);

    const base = {
      rotation: { rotationId: "r1", cftePerWeek: 0.02 },
      week: { weekNumber: 22, holidayNames: ["Thanksgiving Day"] },
      preferences: { preferenceRank: null, deprioritize: false },
      context: makeContext({ parityScores }),
    };

    const penalized = scoreCandidate({
      ...base,
      physician: { physicianId: "p1", availability: "green", headroom: 0.5 },
    });
    const favored = scoreCandidate({
      ...base,
      physician: { physicianId: "p2", availability: "green", headroom: 0.5 },
    });

    expect(favored.breakdown.holidayParity).toBeGreaterThan(penalized.breakdown.holidayParity);
  });
});
