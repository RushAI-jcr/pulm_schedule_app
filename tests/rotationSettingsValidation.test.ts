import { describe, expect, it } from "vitest";
import {
  assertRotationBelongsToFiscalYear,
  validateRotationSettingsInput,
} from "../convex/lib/rotationSettings";

describe("rotation settings validation", () => {
  it("accepts valid rotation settings", () => {
    expect(
      validateRotationSettingsInput({
        cftePerWeek: 0.03,
        minStaff: 1,
        maxConsecutiveWeeks: 4,
      }),
    ).toEqual({
      cftePerWeek: 0.03,
      minStaff: 1,
      maxConsecutiveWeeks: 4,
    });
  });

  it("rejects invalid cFTE/week values", () => {
    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: 0,
        minStaff: 1,
        maxConsecutiveWeeks: 4,
      }),
    ).toThrow("cFTE/week must be a positive number");

    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: Number.NaN,
        minStaff: 1,
        maxConsecutiveWeeks: 4,
      }),
    ).toThrow("cFTE/week must be a positive number");
  });

  it("rejects invalid min staff values", () => {
    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: 0.02,
        minStaff: -1,
        maxConsecutiveWeeks: 4,
      }),
    ).toThrow("Min staff must be a whole number greater than or equal to 0");

    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: 0.02,
        minStaff: 1.5,
        maxConsecutiveWeeks: 4,
      }),
    ).toThrow("Min staff must be a whole number greater than or equal to 0");
  });

  it("rejects invalid max consecutive week values", () => {
    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: 0.02,
        minStaff: 1,
        maxConsecutiveWeeks: 0,
      }),
    ).toThrow("Max consecutive weeks must be an integer between 1 and 52");

    expect(() =>
      validateRotationSettingsInput({
        cftePerWeek: 0.02,
        minStaff: 1,
        maxConsecutiveWeeks: 53,
      }),
    ).toThrow("Max consecutive weeks must be an integer between 1 and 52");
  });

  it("enforces rotation fiscal year ownership", () => {
    expect(() =>
      assertRotationBelongsToFiscalYear({
        rotationFiscalYearId: "fy_27",
        activeFiscalYearId: "fy_27",
      }),
    ).not.toThrow();

    expect(() =>
      assertRotationBelongsToFiscalYear({
        rotationFiscalYearId: "fy_26",
        activeFiscalYearId: "fy_27",
      }),
    ).toThrow("Rotation does not belong to the active fiscal year");
  });
});

