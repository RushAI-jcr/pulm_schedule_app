import { describe, expect, it } from "vitest"
import type { ParsedUploadPayload } from "../src/shared/services/scheduleImport"
import { validateParsedUpload } from "../src/shared/services/scheduleImportValidation"

function buildPayload(overrides?: Partial<ParsedUploadPayload>): ParsedUploadPayload {
  return {
    sourceFileName: "Rojas_Schedule request template FY27.xlsx",
    sourceDoctorToken: "Rojas",
    sourceFiscalYearLabel: "FY27",
    weeks: [
      { weekStart: "2026-06-29", weekEnd: "2026-07-05", availability: "green", sourceRow: 2 },
      { weekStart: "2026-07-06", weekEnd: "2026-07-12", availability: "yellow", sourceRow: 3 },
    ],
    counts: { red: 0, yellow: 1, green: 1, unset: 0 },
    ...overrides,
  }
}

describe("schedule import client validation", () => {
  it("returns null for a valid payload", () => {
    const error = validateParsedUpload({
      payload: buildPayload(),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toBeNull()
  })

  it("rejects fiscal year mismatch", () => {
    const error = validateParsedUpload({
      payload: buildPayload({ sourceFiscalYearLabel: "FY26" }),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toContain("does not match active fiscal year")
  })

  it("rejects doctor token mismatch", () => {
    const error = validateParsedUpload({
      payload: buildPayload({ sourceDoctorToken: "Smith" }),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toContain("does not match Rojas")
  })

  it("rejects missing weeks", () => {
    const error = validateParsedUpload({
      payload: buildPayload({
        weeks: [{ weekStart: "2026-06-29", weekEnd: "2026-07-05", availability: "green", sourceRow: 2 }],
      }),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toContain("exactly 2 weeks")
  })

  it("rejects unknown week_start values", () => {
    const error = validateParsedUpload({
      payload: buildPayload({
        weeks: [
          { weekStart: "2026-06-29", weekEnd: "2026-07-05", availability: "green", sourceRow: 2 },
          { weekStart: "2026-08-01", weekEnd: "2026-08-07", availability: "yellow", sourceRow: 3 },
        ],
      }),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toContain("unknown week_start values")
  })

  it("rejects duplicate week_start values", () => {
    const error = validateParsedUpload({
      payload: buildPayload({
        weeks: [
          { weekStart: "2026-06-29", weekEnd: "2026-07-05", availability: "green", sourceRow: 2 },
          { weekStart: "2026-06-29", weekEnd: "2026-07-12", availability: "yellow", sourceRow: 3 },
        ],
      }),
      fiscalYearLabel: "FY27",
      targetPhysician: { id: "p1", lastName: "Rojas", initials: "JCR" },
      fiscalWeeks: [{ startDate: "2026-06-29" }, { startDate: "2026-07-06" }],
    })

    expect(error).toContain("duplicate week_start values")
  })
})
