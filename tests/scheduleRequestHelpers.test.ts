import { describe, expect, it } from "vitest";
import { requireImportWindow } from "../convex/lib/scheduleRequestHelpers";

describe("requireImportWindow", () => {
  it("allows admin imports while fiscal year is collecting or building", () => {
    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "collecting", requestDeadline: "2099-01-01" },
        actorRole: "admin",
      }),
    ).not.toThrow();

    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "building", requestDeadline: "2000-01-01" },
        actorRole: "admin",
      }),
    ).not.toThrow();
  });

  it("blocks admin imports outside collecting/building", () => {
    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "setup", requestDeadline: "2099-01-01" },
        actorRole: "admin",
      }),
    ).toThrow("Admin imports are only available while fiscal year is collecting or building");

    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "published", requestDeadline: "2099-01-01" },
        actorRole: "admin",
      }),
    ).toThrow("Admin imports are only available while fiscal year is collecting or building");
  });

  it("keeps non-admin imports constrained to collecting window and deadline", () => {
    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "building", requestDeadline: "2099-01-01" },
        actorRole: "physician",
      }),
    ).toThrow("Scheduling requests are only editable while fiscal year is collecting");

    expect(() =>
      requireImportWindow({
        fiscalYear: { status: "collecting", requestDeadline: "2000-01-01" },
        actorRole: "physician",
      }),
    ).toThrow("Request deadline has passed for this fiscal year");
  });
});
