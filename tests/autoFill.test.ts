import { describe, expect, it } from "vitest";
import {
  buildWeekToPhysicianMap,
  hasWeekConflict,
  createSeededRng,
  seededShuffle,
  hashStringToSeed,
  DEFAULT_AUTO_FILL_CONFIG,
} from "../convex/lib/autoFill";

describe("buildWeekToPhysicianMap", () => {
  it("builds a map from assignments", () => {
    const map = buildWeekToPhysicianMap([
      { weekId: "w1", physicianId: "p1" },
      { weekId: "w1", physicianId: "p2" },
      { weekId: "w2", physicianId: "p1" },
    ]);

    expect(map.get("w1")?.has("p1")).toBe(true);
    expect(map.get("w1")?.has("p2")).toBe(true);
    expect(map.get("w2")?.has("p1")).toBe(true);
    expect(map.get("w2")?.size).toBe(1);
  });

  it("skips null/undefined physicianIds", () => {
    const map = buildWeekToPhysicianMap([
      { weekId: "w1", physicianId: null },
      { weekId: "w1", physicianId: undefined },
      { weekId: "w1", physicianId: "p1" },
    ]);

    expect(map.get("w1")?.size).toBe(1);
  });
});

describe("hasWeekConflict", () => {
  it("detects conflict when physician already in week", () => {
    const map = new Map<string, Set<string>>([
      ["w1", new Set(["p1", "p2"])],
    ]);
    expect(hasWeekConflict(map, "w1", "p1")).toBe(true);
    expect(hasWeekConflict(map, "w1", "p3")).toBe(false);
    expect(hasWeekConflict(map, "w2", "p1")).toBe(false);
  });
});

describe("seeded RNG", () => {
  it("produces deterministic results for same seed", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const results1 = Array.from({ length: 10 }, () => rng1());
    const results2 = Array.from({ length: 10 }, () => rng2());

    expect(results1).toEqual(results2);
  });

  it("produces different results for different seeds", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    expect(rng1()).not.toBe(rng2());
  });

  it("produces values in [0, 1)", () => {
    const rng = createSeededRng(12345);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe("seededShuffle", () => {
  it("produces deterministic shuffle for same seed", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    expect(seededShuffle(arr, rng1)).toEqual(seededShuffle(arr, rng2));
  });

  it("does not mutate original array", () => {
    const arr = [1, 2, 3];
    const rng = createSeededRng(42);
    seededShuffle(arr, rng);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe("hashStringToSeed", () => {
  it("produces consistent hash for same string", () => {
    expect(hashStringToSeed("FY27")).toBe(hashStringToSeed("FY27"));
  });

  it("produces different hashes for different strings", () => {
    expect(hashStringToSeed("FY27")).not.toBe(hashStringToSeed("FY28"));
  });
});

describe("DEFAULT_AUTO_FILL_CONFIG", () => {
  it("has weights summing to 100", () => {
    const total =
      DEFAULT_AUTO_FILL_CONFIG.weightPreference +
      DEFAULT_AUTO_FILL_CONFIG.weightHolidayParity +
      DEFAULT_AUTO_FILL_CONFIG.weightWorkloadSpread +
      DEFAULT_AUTO_FILL_CONFIG.weightRotationVariety +
      DEFAULT_AUTO_FILL_CONFIG.weightGapEnforcement;
    expect(total).toBe(100);
  });

  it("includes Thanksgiving and Christmas as major holidays", () => {
    expect(DEFAULT_AUTO_FILL_CONFIG.majorHolidayNames).toContain("Thanksgiving Day");
    expect(DEFAULT_AUTO_FILL_CONFIG.majorHolidayNames).toContain("Christmas Day");
  });
});
