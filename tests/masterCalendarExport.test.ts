import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildMasterCalendarAssignmentCsv,
  buildMasterCalendarExportWorkbook,
  buildMasterCalendarIcs,
  MasterCalendarExportData,
} from "../src/lib/masterCalendarExport";

const fixture: MasterCalendarExportData = {
  fiscalYearLabel: "FY27",
  generatedAtMs: Date.UTC(2026, 5, 1, 12, 0, 0),
  physicians: [
    { id: "p2", fullName: "Bob Brown", initials: "BB" },
    { id: "p1", fullName: "Alice Adams", initials: "AA" },
  ],
  weeks: [
    { id: "w2", weekNumber: 2, startDate: "2026-07-06", endDate: "2026-07-12" },
    { id: "w1", weekNumber: 1, startDate: "2026-06-29", endDate: "2026-07-05" },
  ],
  rotations: [
    { id: "r1", name: "MICU 1", abbreviation: "MICU1" },
    { id: "r2", name: "Pulm", abbreviation: "Pulm" },
  ],
  assignments: [
    {
      physicianId: "p2",
      physicianName: "Bob Brown",
      physicianInitials: "BB",
      weekId: "w2",
      weekNumber: 2,
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      rotationId: "r1",
      rotationName: "MICU 1",
      rotationAbbreviation: "MICU1",
    },
    {
      physicianId: "p1",
      physicianName: "Alice Adams",
      physicianInitials: "AA",
      weekId: "w1",
      weekNumber: 1,
      weekStartDate: "2026-06-29",
      weekEndDate: "2026-07-05",
      rotationId: "r2",
      rotationName: "Pulm",
      rotationAbbreviation: "Pulm",
    },
    {
      physicianId: "p1",
      physicianName: "Alice Adams",
      physicianInitials: "AA",
      weekId: "w1",
      weekNumber: 1,
      weekStartDate: "2026-06-29",
      weekEndDate: "2026-07-05",
      rotationId: "r1",
      rotationName: "MICU 1",
      rotationAbbreviation: "MICU1",
    },
  ],
  calendarEvents: [
    {
      id: "e1",
      weekId: "w1",
      weekNumber: 1,
      date: "2026-07-04",
      name: "Independence Day",
      category: "federal_holiday",
      source: "nager_api",
      isApproved: true,
      isVisible: true,
    },
    {
      id: "e2",
      weekId: "w2",
      weekNumber: 2,
      date: "2026-07-15",
      name: "CHEST",
      category: "conference",
      source: "admin_manual",
      isApproved: true,
      isVisible: true,
    },
    {
      id: "e3",
      weekId: "w2",
      weekNumber: 2,
      date: "2026-07-18",
      name: "Committee Meeting",
      category: "other",
      source: "admin_manual",
      isApproved: true,
      isVisible: true,
    },
  ],
};

describe("master calendar export helpers", () => {
  it("builds CSV assignment rows with physician/week/rotation columns", () => {
    const csv = buildMasterCalendarAssignmentCsv(fixture).trim().split("\n");

    expect(csv).toEqual([
      "Physician,Week,Rotation",
      "Alice Adams,Week 1,MICU 1",
      "Alice Adams,Week 1,Pulm",
      "Bob Brown,Week 2,MICU 1",
    ]);
  });

  it("builds workbook with schedule grid, assignment list, and calendar events", () => {
    const workbook = buildMasterCalendarExportWorkbook(fixture);

    expect(workbook.SheetNames).toEqual([
      "Schedule Grid",
      "Assignment List",
      "Calendar Events",
    ]);

    const scheduleRows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets["Schedule Grid"],
      { header: 1, raw: true },
    );
    expect(scheduleRows[0]).toEqual([
      "Physician",
      "Initials",
      "W1 (2026-06-29 to 2026-07-05)",
      "W2 (2026-07-06 to 2026-07-12)",
    ]);
    expect(scheduleRows[1]).toEqual(["Alice Adams", "AA", "MICU1; Pulm", ""]);
    expect(scheduleRows[2]).toEqual(["Bob Brown", "BB", "", "MICU1"]);

    const assignmentRows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets["Assignment List"],
      { header: 1, raw: true },
    );
    expect(assignmentRows[0]).toEqual([
      "Physician",
      "Initials",
      "Week",
      "Week Start",
      "Week End",
      "Rotation",
      "Rotation Abbreviation",
    ]);
    expect(assignmentRows).toHaveLength(4);

    const eventRows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets["Calendar Events"],
      { header: 1, raw: true },
    );
    expect(eventRows[0]).toEqual([
      "Date",
      "Event",
      "Category",
      "Source",
      "Week",
      "Approved",
      "Visible",
    ]);
    expect(eventRows).toHaveLength(4);
  });

  it("builds ICS with week-long assignment events plus holiday/conference events", () => {
    const ics = buildMasterCalendarIcs(fixture);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:MICU 1 - Alice Adams");
    expect(ics).toContain("SUMMARY:Pulm - Alice Adams");
    expect(ics).toContain("SUMMARY:MICU 1 - Bob Brown");
    expect(ics).toContain("SUMMARY:Independence Day");
    expect(ics).toContain("SUMMARY:CHEST");
    expect(ics).not.toContain("Committee Meeting");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260629");
    expect(ics).toContain("DTEND;VALUE=DATE:20260706");
  });
});
