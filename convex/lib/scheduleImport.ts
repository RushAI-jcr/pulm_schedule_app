import { Doc } from "../_generated/dataModel";

export type ImportAvailability = "red" | "yellow" | "green" | "unset";

type DoctorMatchTarget = Pick<Doc<"physicians">, "lastName" | "initials">;

export type UploadedWeekInput = {
  weekStart: string;
  availability: ImportAvailability;
};

export type FiscalWeekRecord<TWeekId extends string = string> = {
  _id: TWeekId;
  startDate: string;
};

export function normalizeImportToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeImportFiscalYearLabel(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^FY\s*([0-9]{1,4})$/);
  if (!match) return trimmed;
  return `FY${match[1]}`;
}

export function doesImportDoctorTokenMatch(
  sourceDoctorToken: string,
  target: DoctorMatchTarget,
): boolean {
  const normalizedToken = normalizeImportToken(sourceDoctorToken);
  if (!normalizedToken) return false;

  const candidates = [target.lastName, target.initials]
    .map((value) => normalizeImportToken(value))
    .filter((value) => value.length > 0);

  return candidates.includes(normalizedToken);
}

export function getWeekCoverageDiff(expectedWeekStarts: string[], uploadedWeekStarts: string[]) {
  const expectedSet = new Set(expectedWeekStarts);
  const uploadedSet = new Set<string>();

  const duplicates: string[] = [];
  const unknown: string[] = [];

  for (const weekStart of uploadedWeekStarts) {
    if (uploadedSet.has(weekStart) && !duplicates.includes(weekStart)) {
      duplicates.push(weekStart);
    }
    uploadedSet.add(weekStart);

    if (!expectedSet.has(weekStart) && !unknown.includes(weekStart)) {
      unknown.push(weekStart);
    }
  }

  const missing = expectedWeekStarts.filter((weekStart) => !uploadedSet.has(weekStart));

  return {
    missing,
    unknown,
    duplicates,
  };
}

export function mapUploadedWeeksToFiscalWeeks<TWeekId extends string>(params: {
  expectedWeeks: Array<FiscalWeekRecord<TWeekId>>;
  uploadedWeeks: UploadedWeekInput[];
}) {
  const weekByStartDate = new Map<string, FiscalWeekRecord<TWeekId>>();
  for (const week of params.expectedWeeks) {
    weekByStartDate.set(week.startDate, week);
  }

  const mappedWeeks: Array<{ weekId: TWeekId; availability: ImportAvailability }> = [];
  for (const uploadedWeek of params.uploadedWeeks) {
    const week = weekByStartDate.get(uploadedWeek.weekStart);
    if (!week) continue;

    mappedWeeks.push({
      weekId: week._id,
      availability: uploadedWeek.availability,
    });
  }

  return mappedWeeks;
}
