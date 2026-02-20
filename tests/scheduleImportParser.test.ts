import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  classifyColor,
  parseScheduleImportCsvText,
  parseScheduleImportXlsxBytes,
  parseUploadMetadataFromFileName,
} from "../src/shared/services/scheduleImport";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function buildSheetXml(rows: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${rows}
  </sheetData>
</worksheet>`;
}

function buildXlsx(sheetXml: string): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF00"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="00B050"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0000"/></patternFill></fill>
  </fills>
  <cellXfs count="4">
    <xf fillId="0"/>
    <xf fillId="2"/>
    <xf fillId="3"/>
    <xf fillId="4"/>
  </cellXfs>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  };

  return toArrayBuffer(zipSync(files));
}

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

  it("parses quoted CSV values", () => {
    const csv = [
      "week_start,preference",
      "\"2026-06-29\",\"green\"",
    ].join("\n");

    const parsed = parseScheduleImportCsvText(csv, "Rojas_Schedule request template FY27.csv");
    expect(parsed.weeks[0].weekStart).toBe("2026-06-29");
    expect(parsed.weeks[0].availability).toBe("green");
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

  it("rejects CSV files that exceed the supported row limit", () => {
    const rows = Array.from({ length: 1001 }, (_, idx) => {
      const day = String((idx % 28) + 1).padStart(2, "0");
      return `2026-07-${day},green`;
    });
    const csv = ["week_start,preference", ...rows].join("\n");

    expect(() =>
      parseScheduleImportCsvText(csv, "Rojas_Schedule request template FY27.csv"),
    ).toThrow("CSV exceeds maximum supported rows");
  });

  it("parses workbook rows and color fills", () => {
    const sheetXml = buildSheetXml(`
    <row r="1">
      <c r="A1" t="str"><v>Week Start</v></c>
      <c r="B1" t="str"><v>Week End</v></c>
      <c r="C1" t="str"><v>Preference</v></c>
    </row>
    <row r="2">
      <c r="A2" t="str"><v>2026-06-29</v></c>
      <c r="B2" t="str"><v>2026-07-05</v></c>
      <c r="C2" s="1"><v></v></c>
    </row>
    <row r="3">
      <c r="A3" t="str"><v>2026-07-06</v></c>
      <c r="B3" t="str"><v>2026-07-12</v></c>
      <c r="C3" s="2"><v></v></c>
    </row>
    <row r="4">
      <c r="A4" t="str"><v>2026-07-13</v></c>
      <c r="B4" t="str"><v>2026-07-19</v></c>
      <c r="C4" s="3"><v></v></c>
    </row>`);

    const parsed = parseScheduleImportXlsxBytes(
      buildXlsx(sheetXml),
      "Rojas_Schedule request template FY27.xlsx",
    );

    expect(parsed.weeks).toHaveLength(3);
    expect(parsed.weeks.map((row) => row.availability)).toEqual(["yellow", "green", "red"]);
    expect(parsed.counts).toEqual({ red: 1, yellow: 1, green: 1, unset: 0 });
  });

  it("rejects workbooks that exceed the supported row limit", () => {
    const dataRows = Array.from({ length: 1001 }, (_, idx) => {
      const day = String((idx % 28) + 1).padStart(2, "0");
      return `<row r="${idx + 2}"><c r="A${idx + 2}" t="str"><v>2026-07-${day}</v></c></row>`;
    }).join("\n");

    const sheetXml = buildSheetXml(`<row r="1"><c r="A1" t="str"><v>Week Start</v></c></row>\n${dataRows}`);

    expect(() =>
      parseScheduleImportXlsxBytes(
        buildXlsx(sheetXml),
        "Rojas_Schedule request template FY27.xlsx",
      ),
    ).toThrow("Workbook exceeds maximum supported rows");
  });
});
