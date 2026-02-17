import { describe, expect, it } from "vitest";
import {
  identifyHolidayWeeks,
  identifyAllHolidayWeeks,
  buildPriorYearHolidayMap,
  computeHolidayParityScores,
} from "../convex/lib/autoFillHolidays";

describe("identifyHolidayWeeks", () => {
  const events = [
    { weekId: "w22", name: "Thanksgiving Day", category: "federal_holiday", isApproved: true },
    { weekId: "w26", name: "Christmas Day", category: "federal_holiday", isApproved: true },
    { weekId: "w1", name: "Independence Day", category: "federal_holiday", isApproved: true },
    { weekId: "w10", name: "CHEST", category: "conference", isApproved: true },
    { weekId: "w30", name: "New Year's Day", category: "federal_holiday", isApproved: false },
  ];

  it("identifies only major holiday weeks", () => {
    const map = identifyHolidayWeeks(events, ["Thanksgiving Day", "Christmas Day"]);
    expect(map.size).toBe(2);
    expect(map.get("w22")).toEqual(["Thanksgiving Day"]);
    expect(map.get("w26")).toEqual(["Christmas Day"]);
  });

  it("is case-insensitive on holiday names", () => {
    const map = identifyHolidayWeeks(events, ["thanksgiving day"]);
    expect(map.size).toBe(1);
    expect(map.get("w22")).toEqual(["Thanksgiving Day"]);
  });

  it("excludes unapproved events", () => {
    const map = identifyHolidayWeeks(events, ["New Year's Day"]);
    expect(map.size).toBe(0);
  });

  it("excludes non-federal-holiday categories", () => {
    const map = identifyHolidayWeeks(events, ["CHEST"]);
    expect(map.size).toBe(0);
  });
});

describe("identifyAllHolidayWeeks", () => {
  it("returns all approved federal holidays", () => {
    const events = [
      { weekId: "w1", name: "Independence Day", category: "federal_holiday", isApproved: true },
      { weekId: "w22", name: "Thanksgiving Day", category: "federal_holiday", isApproved: true },
      { weekId: "w10", name: "CHEST", category: "conference", isApproved: true },
    ];

    const map = identifyAllHolidayWeeks(events);
    expect(map.size).toBe(2);
    expect(map.has("w1")).toBe(true);
    expect(map.has("w22")).toBe(true);
  });
});

describe("buildPriorYearHolidayMap", () => {
  it("maps holiday names to physicians who worked them", () => {
    const priorAssignments = [
      { weekId: "w22", physicianId: "p1" },
      { weekId: "w22", physicianId: "p2" },
      { weekId: "w26", physicianId: "p3" },
    ];
    const priorHolidays = new Map([
      ["w22", ["Thanksgiving Day"]],
      ["w26", ["Christmas Day"]],
    ]);

    const result = buildPriorYearHolidayMap(priorAssignments, priorHolidays);
    expect(result.get("thanksgiving day")).toEqual(["p1", "p2"]);
    expect(result.get("christmas day")).toEqual(["p3"]);
  });

  it("handles no assignments gracefully", () => {
    const result = buildPriorYearHolidayMap([], new Map());
    expect(result.size).toBe(0);
  });
});

describe("computeHolidayParityScores", () => {
  const majorHolidays = ["Thanksgiving Day", "Christmas Day"];
  const candidates = ["p1", "p2", "p3"];

  it("penalizes physicians who worked this holiday last year", () => {
    const priorMap = new Map([
      ["thanksgiving day", ["p1"]],
      ["christmas day", ["p2"]],
    ]);

    const scores = computeHolidayParityScores({
      majorHolidayNames: majorHolidays,
      priorYearHolidayAssignments: priorMap,
      currentYearCandidates: candidates,
    });

    // p1 worked Thanksgiving last year -> penalty for Thanksgiving
    expect(scores.get("p1")?.get("thanksgiving day")).toBe(-50);
    // p1 worked something else -> bonus for Christmas
    expect(scores.get("p1")?.get("christmas day")).toBe(30);

    // p2 worked Christmas last year -> penalty for Christmas
    expect(scores.get("p2")?.get("christmas day")).toBe(-50);
    // p2 worked something -> bonus for Thanksgiving
    expect(scores.get("p2")?.get("thanksgiving day")).toBe(30);

    // p3 worked nothing -> neutral
    expect(scores.get("p3")?.get("thanksgiving day")).toBe(0);
    expect(scores.get("p3")?.get("christmas day")).toBe(0);
  });

  it("returns all zeros when no prior year data", () => {
    const scores = computeHolidayParityScores({
      majorHolidayNames: majorHolidays,
      priorYearHolidayAssignments: new Map(),
      currentYearCandidates: candidates,
    });

    for (const pid of candidates) {
      for (const holiday of majorHolidays) {
        expect(scores.get(pid)?.get(holiday.toLowerCase())).toBe(0);
      }
    }
  });
});
