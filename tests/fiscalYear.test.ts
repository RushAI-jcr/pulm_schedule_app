import { describe, expect, it } from "vitest";
import { isRequestDeadlineOpen, parseRequestDeadlineMs } from "../convex/lib/fiscalYear";

describe("fiscal year deadline helpers", () => {
  it("returns null when deadline is not configured", () => {
    expect(parseRequestDeadlineMs({ requestDeadline: undefined })).toBe(null);
  });

  it("throws for invalid deadline value", () => {
    expect(() => parseRequestDeadlineMs({ requestDeadline: "not-a-date" })).toThrow(
      "Fiscal year request deadline is invalid",
    );
  });

  it("detects if request window is still open", () => {
    const deadline = "2027-01-01T12:00:00.000Z";
    const deadlineMs = Date.parse(deadline);

    expect(isRequestDeadlineOpen({ requestDeadline: deadline }, deadlineMs - 1)).toBe(true);
    expect(isRequestDeadlineOpen({ requestDeadline: deadline }, deadlineMs + 1)).toBe(false);
  });
});
