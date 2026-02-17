export type NagerPublicHoliday = {
  date: string;
  localName?: string;
  name?: string;
  countryCode?: string;
  global?: boolean;
  types?: string[];
};

export type CalendarificHoliday = {
  name?: string;
  date?: {
    iso?: string;
  };
  type?: string[];
};

export type FiscalWeekForCalendarEvent<TWeekId extends string = string> = {
  _id: TWeekId;
  startDate: string;
  endDate: string;
  weekNumber?: number;
};

export type MappedHolidayEvent<TWeekId extends string = string> = {
  weekId: TWeekId;
  weekNumber: number | null;
  date: string;
  name: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const INSTITUTIONAL_CONFERENCE_NAMES = ["CHEST", "SCCM", "ATS"] as const;
export type InstitutionalConferenceName = (typeof INSTITUTIONAL_CONFERENCE_NAMES)[number];

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasPublicHolidayType(types: string[] | undefined): boolean {
  if (!types || types.length === 0) return true;
  return types.some((value) => value.trim().toLowerCase() === "public");
}

function hasReligiousType(types: string[] | undefined): boolean {
  if (!types || types.length === 0) return true;
  return types.some((value) => value.trim().toLowerCase().includes("religious"));
}

function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

function extractCalendarificIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  return isIsoDate(candidate) ? candidate : null;
}

export function buildHolidayEventKey(date: string, name: string): string {
  return `${date}::${normalizeName(name).toLowerCase()}`;
}

export function normalizeInstitutionalConferenceName(value: string): InstitutionalConferenceName | null {
  const upper = normalizeName(value).toUpperCase();
  if (upper === "CHEST") return "CHEST";
  if (upper === "SCCM") return "SCCM";
  if (upper === "ATS") return "ATS";
  return null;
}

export function getCalendarYearsInDateRange(startDate: string, endDate: string): number[] {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Fiscal year dates must be in ISO format (YYYY-MM-DD)");
  }

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
    throw new Error("Fiscal year date range is invalid");
  }

  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

export function findFiscalWeekForDate<TWeekId extends string>(
  weeks: Array<FiscalWeekForCalendarEvent<TWeekId>>,
  isoDate: string,
): FiscalWeekForCalendarEvent<TWeekId> | null {
  if (!isIsoDate(isoDate)) return null;
  return weeks.find((week) => week.startDate <= isoDate && isoDate <= week.endDate) ?? null;
}

export function mapUsPublicHolidaysToFiscalWeeks<TWeekId extends string>(params: {
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  weeks: Array<FiscalWeekForCalendarEvent<TWeekId>>;
  holidays: NagerPublicHoliday[];
}): Array<MappedHolidayEvent<TWeekId>> {
  const weeks = [...params.weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const seen = new Set<string>();
  const mapped: Array<MappedHolidayEvent<TWeekId>> = [];

  for (const holiday of params.holidays) {
    if (holiday.countryCode && holiday.countryCode.toUpperCase() !== "US") continue;
    if (holiday.global === false) continue;
    if (!hasPublicHolidayType(holiday.types)) continue;
    if (!isIsoDate(holiday.date)) continue;
    if (holiday.date < params.fiscalYearStartDate || holiday.date > params.fiscalYearEndDate) continue;

    const primaryName = normalizeName(holiday.name ?? "");
    const fallbackName = normalizeName(holiday.localName ?? "");
    const name = primaryName || fallbackName;
    if (!name) continue;

    const week = findFiscalWeekForDate(weeks, holiday.date);
    if (!week) continue;

    const key = buildHolidayEventKey(holiday.date, name);
    if (seen.has(key)) continue;
    seen.add(key);

    mapped.push({
      weekId: week._id,
      weekNumber: typeof week.weekNumber === "number" ? week.weekNumber : null,
      date: holiday.date,
      name,
    });
  }

  mapped.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });

  return mapped;
}

export function mapCalendarificReligiousObservancesToFiscalWeeks<TWeekId extends string>(params: {
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  weeks: Array<FiscalWeekForCalendarEvent<TWeekId>>;
  holidays: CalendarificHoliday[];
}): Array<MappedHolidayEvent<TWeekId>> {
  const weeks = [...params.weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const seen = new Set<string>();
  const mapped: Array<MappedHolidayEvent<TWeekId>> = [];

  for (const holiday of params.holidays) {
    if (!hasReligiousType(holiday.type)) continue;
    const isoDate = extractCalendarificIsoDate(holiday.date?.iso);
    if (!isoDate) continue;
    if (isoDate < params.fiscalYearStartDate || isoDate > params.fiscalYearEndDate) continue;

    const name = normalizeName(holiday.name ?? "");
    if (!name) continue;

    const week = findFiscalWeekForDate(weeks, isoDate);
    if (!week) continue;

    const key = buildHolidayEventKey(isoDate, name);
    if (seen.has(key)) continue;
    seen.add(key);

    mapped.push({
      weekId: week._id,
      weekNumber: typeof week.weekNumber === "number" ? week.weekNumber : null,
      date: isoDate,
      name,
    });
  }

  mapped.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });

  return mapped;
}
