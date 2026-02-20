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

// Convex IDs are opaque alphanumeric+underscore strings. Validate before
// embedding in ICS UID fields to prevent structural injection.
function sanitizeConvexId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
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
      `UID:assignment-${sanitizeConvexId(assignment.weekId)}-${sanitizeConvexId(assignment.rotationId)}-${sanitizeConvexId(assignment.physicianId)}@rush-pccm`,
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
    lines.push(`UID:calendar-event-${sanitizeConvexId(event.id)}@rush-pccm`);
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
