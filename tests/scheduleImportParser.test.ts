import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  classifyColor,
  parseScheduleImportCsvText,
  parseScheduleImportWorkbook,
  parseUploadMetadataFromFileName,
} from "../src/lib/scheduleImport";

describe("schedule import parser", () => {
  it("maps exact color hex values", () => {
    expect(classifyColor("FF0000")).toBe("red");
    expect(classifyColor("FFFF00")).toBe("yellow");
    expect(classifyColor("00B050")).toBe("green");
    expect(classifyColor("FFFFFF")).toBe("unset");
  });

  it("supports fuzzy color classification", () => {
    expect(classifyColor("E53935")).toBe("red");
    expect(classifyColor("F9C74F")).toBe("yellow");
    expect(classifyColor("2ECC71")).toBe("green");
  });

  it("parses filename metadata", () => {
    const parsed = parseUploadMetadataFromFileName("Rojas_Schedule request template FY27.xlsx");

    expect(parsed.sourceDoctorToken).toBe("Rojas");
    expect(parsed.sourceFiscalYearLabel).toBe("FY27");
  });

  it("parses CSV with week_start and preference columns", () => {
    const csv = [
      "week_start,week_end,preference",
      "2026-06-29,2026-07-05,yellow",
      "2026-07-06,2026-07-12,green",
    ].join("\n");

    const parsed = parseScheduleImportCsvText(csv, "Rojas_Schedule request template FY27.csv");

    expect(parsed.weeks).toHaveLength(2);
    expect(parsed.weeks[0].weekStart).toBe("2026-06-29");
    expect(parsed.weeks[0].availability).toBe("yellow");
    expect(parsed.weeks[1].availability).toBe("green");
    expect(parsed.counts).toEqual({ red: 0, yellow: 1, green: 1, unset: 0 });
  });

  it("rejects duplicate CSV week_start values", () => {
    const csv = [
      "week_start,preference",
      "2026-06-29,green",
      "2026-06-29,red",
    ].join("\n");

    expect(() =>
      parseScheduleImportCsvText(csv, "Rojas_Schedule request template FY27.csv"),
    ).toThrow("Duplicate week_start");
  });

  it("parses workbook rows and color fills", () => {
    const ws = {
      "!ref": "A1:C4",
      A1: { t: "s", v: "Week Start" },
      B1: { t: "s", v: "Week End" },
      C1: { t: "s", v: "Preference" },
      A2: { t: "d", v: new Date(2026, 5, 29) },
      B2: { t: "d", v: new Date(2026, 6, 5) },
      C2: { t: "z", s: { patternType: "solid", fgColor: { rgb: "FFFF00" } } },
      A3: { t: "d", v: new Date(2026, 6, 6) },
      B3: { t: "d", v: new Date(2026, 6, 12) },
      C3: { t: "z", s: { patternType: "solid", fgColor: { rgb: "00B050" } } },
      A4: { t: "d", v: new Date(2026, 6, 13) },
      B4: { t: "d", v: new Date(2026, 6, 19) },
      C4: { t: "z", s: { patternType: "solid", fgColor: { rgb: "FF0000" } } },
    } as XLSX.WorkSheet;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const parsed = parseScheduleImportWorkbook(wb, "Rojas_Schedule request template FY27.xlsx");

    expect(parsed.weeks).toHaveLength(3);
    expect(parsed.weeks.map((row) => row.availability)).toEqual(["yellow", "green", "red"]);
    expect(parsed.counts).toEqual({ red: 1, yellow: 1, green: 1, unset: 0 });
  });
});
