import * as XLSX from "xlsx";

export type MasterCalendarExportPhysician = {
  id: string;
  fullName: string;
  initials: string;
};

export type MasterCalendarExportWeek = {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
};

export type MasterCalendarExportRotation = {
  id: string;
  name: string;
  abbreviation: string;
};

export type MasterCalendarExportAssignment = {
  physicianId: string;
  physicianName: string;
  physicianInitials: string;
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  rotationId: string;
  rotationName: string;
  rotationAbbreviation: string;
};

export type MasterCalendarExportEvent = {
  id: string;
  weekId?: string | null;
  weekNumber?: number | null;
  date: string;
  name: string;
  category: string;
  source?: string | null;
  isApproved?: boolean | null;
  isVisible?: boolean | null;
};

export type MasterCalendarExportData = {
  fiscalYearLabel: string;
  generatedAtMs: number;
  physicians: MasterCalendarExportPhysician[];
  weeks: MasterCalendarExportWeek[];
  rotations: MasterCalendarExportRotation[];
  assignments: MasterCalendarExportAssignment[];
  calendarEvents: MasterCalendarExportEvent[];
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ICS_HOLIDAY_OR_CONFERENCE_CATEGORIES = new Set([
  "federal_holiday",
  "religious_observance",
  "cultural_observance",
  "conference",
]);

function sortAssignments(
  rows: MasterCalendarExportAssignment[],
): MasterCalendarExportAssignment[] {
  return [...rows].sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;

    const byRotation = a.rotationName.localeCompare(b.rotationName);
    if (byRotation !== 0) return byRotation;

    return a.physicianName.localeCompare(b.physicianName);
  });
}

function sortWeeks(rows: MasterCalendarExportWeek[]): MasterCalendarExportWeek[] {
  return [...rows].sort((a, b) => a.weekNumber - b.weekNumber);
}

function sortPhysicians(rows: MasterCalendarExportPhysician[]): MasterCalendarExportPhysician[] {
  return [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function sortCalendarEvents(rows: MasterCalendarExportEvent[]): MasterCalendarExportEvent[] {
  return [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function toWeekLabel(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

export function buildMasterCalendarAssignmentCsv(data: MasterCalendarExportData): string {
  const lines = ["Physician,Week,Rotation"];
  for (const row of sortAssignments(data.assignments)) {
    lines.push(
      [
        csvEscape(row.physicianName),
        csvEscape(toWeekLabel(row.weekNumber)),
        csvEscape(row.rotationName),
      ].join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function buildMasterCalendarExportWorkbook(data: MasterCalendarExportData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const weeks = sortWeeks(data.weeks);
  const physicians = sortPhysicians(data.physicians);
  const assignments = sortAssignments(data.assignments);
  const assignmentByPhysicianWeek = new Map<string, string[]>();
  for (const assignment of assignments) {
    const key = `${assignment.physicianId}:${assignment.weekId}`;
    const existing = assignmentByPhysicianWeek.get(key) ?? [];
    existing.push(assignment.rotationAbbreviation || assignment.rotationName);
    assignmentByPhysicianWeek.set(key, existing);
  }

  const scheduleHeader = [
    "Physician",
    "Initials",
    ...weeks.map((week) => `W${week.weekNumber} (${week.startDate} to ${week.endDate})`),
  ];
  const scheduleRows: (string | number)[][] = [scheduleHeader];
  for (const physician of physicians) {
    const row: (string | number)[] = [physician.fullName, physician.initials];
    for (const week of weeks) {
      const value = assignmentByPhysicianWeek
        .get(`${physician.id}:${week.id}`)
        ?.join("; ") ?? "";
      row.push(value);
    }
    scheduleRows.push(row);
  }

  const scheduleSheet = XLSX.utils.aoa_to_sheet(scheduleRows);
  XLSX.utils.book_append_sheet(workbook, scheduleSheet, "Schedule Grid");

  const assignmentRows: (string | number)[][] = [
    [
      "Physician",
      "Initials",
      "Week",
      "Week Start",
      "Week End",
      "Rotation",
      "Rotation Abbreviation",
    ],
  ];
  for (const assignment of assignments) {
    assignmentRows.push([
      assignment.physicianName,
      assignment.physicianInitials,
      assignment.weekNumber,
      assignment.weekStartDate,
      assignment.weekEndDate,
      assignment.rotationName,
      assignment.rotationAbbreviation,
    ]);
  }

  const assignmentSheet = XLSX.utils.aoa_to_sheet(assignmentRows);
  XLSX.utils.book_append_sheet(workbook, assignmentSheet, "Assignment List");

  const eventRows: (string | number | boolean)[][] = [
    ["Date", "Event", "Category", "Source", "Week", "Approved", "Visible"],
  ];
  for (const event of sortCalendarEvents(data.calendarEvents)) {
    eventRows.push([
      event.date,
      event.name,
      event.category,
      event.source ?? "",
      event.weekNumber ?? "",
      event.isApproved ?? "",
      event.isVisible ?? "",
    ]);
  }

  const eventsSheet = XLSX.utils.aoa_to_sheet(eventRows);
  XLSX.utils.book_append_sheet(workbook, eventsSheet, "Calendar Events");

  return workbook;
}

export function buildMasterCalendarExportXlsxBytes(data: MasterCalendarExportData): ArrayBuffer {
  const workbook = buildMasterCalendarExportWorkbook(data);
  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function formatDateTimeUtc(date: Date): string {
  return `${formatDateUtc(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(
    date.getUTCSeconds(),
  )}Z`;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

export function buildMasterCalendarIcs(data: MasterCalendarExportData): string {
  const dtstamp = formatDateTimeUtc(new Date(data.generatedAtMs));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rush PCCM//Master Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${data.fiscalYearLabel} Master Calendar`)}`,
  ];

  for (const assignment of sortAssignments(data.assignments)) {
    if (!isIsoDate(assignment.weekStartDate) || !isIsoDate(assignment.weekEndDate)) continue;
    const exclusiveEnd = addDaysToIsoDate(assignment.weekEndDate, 1);
    if (!isIsoDate(exclusiveEnd)) continue;

    lines.push("BEGIN:VEVENT");
    lines.push(
      `UID:${escapeIcsText(
        `assignment-${assignment.weekId}-${assignment.rotationId}-${assignment.physicianId}@rush-pccm`,
      )}`,
    );
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(assignment.weekStartDate)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(exclusiveEnd)}`);
    lines.push(
      `SUMMARY:${escapeIcsText(`${assignment.rotationName} - ${assignment.physicianName}`)}`,
    );
    lines.push(
      `DESCRIPTION:${escapeIcsText(
        [
          `Week ${assignment.weekNumber}: ${assignment.weekStartDate} to ${assignment.weekEndDate}`,
          `Physician: ${assignment.physicianName} (${assignment.physicianInitials})`,
          `Rotation: ${assignment.rotationName}`,
        ].join("\n"),
      )}`,
    );
    lines.push("END:VEVENT");
  }

  const calendarEvents = sortCalendarEvents(data.calendarEvents).filter((event) => {
    if (!isIsoDate(event.date)) return false;
    if (event.isVisible === false) return false;
    return ICS_HOLIDAY_OR_CONFERENCE_CATEGORIES.has(normalizeCategory(event.category));
  });

  for (const event of calendarEvents) {
    const exclusiveEnd = addDaysToIsoDate(event.date, 1);
    if (!isIsoDate(exclusiveEnd)) continue;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(`calendar-event-${event.id}@rush-pccm`)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(exclusiveEnd)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.name)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(
        [`Category: ${event.category}`, event.weekNumber ? `Week: ${event.weekNumber}` : ""]
          .filter(Boolean)
          .join("\n"),
      )}`,
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
