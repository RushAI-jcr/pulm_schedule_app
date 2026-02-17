import { describe, expect, it } from "vitest";
import { isValidTargetCfte } from "../convex/lib/cfteTargets";

describe("cfte target validation", () => {
  it("accepts values in supported range", () => {
    expect(isValidTargetCfte(0)).toBe(true);
    expect(isValidTargetCfte(0.6)).toBe(true);
    expect(isValidTargetCfte(1.5)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidTargetCfte(-0.001)).toBe(false);
    expect(isValidTargetCfte(1.501)).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(isValidTargetCfte(Number.NaN)).toBe(false);
    expect(isValidTargetCfte(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
