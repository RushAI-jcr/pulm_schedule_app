import { describe, expect, it } from "vitest";
import { isValidActiveWeeks, isValidHalfDaysPerWeek } from "../convex/lib/physicianClinics";

describe("physician clinic assignment validation", () => {
  it("validates half-days per week from 0 to 10", () => {
    expect(isValidHalfDaysPerWeek(0)).toBe(true);
    expect(isValidHalfDaysPerWeek(5)).toBe(true);
    expect(isValidHalfDaysPerWeek(10)).toBe(true);
    expect(isValidHalfDaysPerWeek(-1)).toBe(false);
    expect(isValidHalfDaysPerWeek(11)).toBe(false);
    expect(isValidHalfDaysPerWeek(1.5)).toBe(false);
  });

  it("validates active weeks from 0 to 52", () => {
    expect(isValidActiveWeeks(0)).toBe(true);
    expect(isValidActiveWeeks(40)).toBe(true);
    expect(isValidActiveWeeks(52)).toBe(true);
    expect(isValidActiveWeeks(-1)).toBe(false);
    expect(isValidActiveWeeks(53)).toBe(false);
    expect(isValidActiveWeeks(10.2)).toBe(false);
  });
});
