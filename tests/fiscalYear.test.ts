import { describe, expect, it } from "vitest";
import {
  isRequestDeadlineOpen,
  parseRequestDeadlineMs,
  pickMostRelevantFiscalYear,
} from "../convex/lib/fiscalYear";

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

describe("pickMostRelevantFiscalYear", () => {
  it("selects the fiscal year containing the current date", () => {
    const now = Date.parse("2026-10-01T00:00:00.000Z");
    const result = pickMostRelevantFiscalYear(
      [
        {
          _id: "fy-old",
          _creationTime: 1,
          label: "FY 2025-2026",
          startDate: "2025-06-23",
          endDate: "2026-07-05",
          status: "published",
        },
        {
          _id: "fy-current",
          _creationTime: 2,
          label: "FY27",
          startDate: "2026-06-29",
          endDate: "2027-06-27",
          status: "published",
        },
        {
          _id: "fy-future",
          _creationTime: 3,
          label: "FY28",
          startDate: "2027-06-28",
          endDate: "2028-06-29",
          status: "setup",
        },
      ] as any,
      now,
    );
    expect(result.label).toBe("FY27");
  });

  it("selects the nearest upcoming year when none contains the current date", () => {
    const now = Date.parse("2025-01-01T00:00:00.000Z");
    const result = pickMostRelevantFiscalYear(
      [
        {
          _id: "fy-1",
          _creationTime: 1,
          label: "FY 2025-2026",
          startDate: "2025-06-23",
          endDate: "2026-07-05",
          status: "published",
        },
        {
          _id: "fy-2",
          _creationTime: 2,
          label: "FY27",
          startDate: "2026-06-29",
          endDate: "2027-06-27",
          status: "setup",
        },
      ] as any,
      now,
    );
    expect(result.label).toBe("FY 2025-2026");
  });
});
