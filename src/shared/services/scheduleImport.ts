import * as XLSX from "xlsx";

export type UploadAvailability = "red" | "yellow" | "green" | "unset";

export interface ParsedImportRow {
  weekStart: string;
  weekEnd: string | null;
  availability: UploadAvailability;
  sourceRow: number;
}

export interface ParsedUploadPayload {
  sourceFileName: string;
  sourceDoctorToken: string;
  sourceFiscalYearLabel: string;
  weeks: ParsedImportRow[];
  counts: Record<UploadAvailability, number>;
}

type DoctorMatchTarget = {
  lastName: string;
  initials: string;
};

const EXACT_COLOR_MAP: Record<string, Exclude<UploadAvailability, "unset">> = {
  FF0000: "red",
  FFFF0000: "red",
  "00B050": "green",
  FF00B050: "green",
  FFFF00: "yellow",
  FFFFFF00: "yellow",
};

const AVAILABILITY_VALUES: UploadAvailability[] = ["red", "yellow", "green", "unset"];

export function normalizeDoctorToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function doesDoctorTokenMatch(sourceDoctorToken: string, target: DoctorMatchTarget): boolean {
  const normalizedToken = normalizeDoctorToken(sourceDoctorToken);
  if (!normalizedToken) return false;

  const candidates = [target.lastName, target.initials]
    .map((candidate) => normalizeDoctorToken(candidate))
    .filter((candidate) => candidate.length > 0);

  return candidates.includes(normalizedToken);
}

export function normalizeFiscalYearLabel(value: string): string {
  const match = value.trim().toUpperCase().match(/^FY\s*([0-9]{1,4})$/);
  if (!match) return value.trim().toUpperCase();
  return `FY${match[1]}`;
}

export function parseUploadMetadataFromFileName(fileName: string): {
  sourceDoctorToken: string;
  sourceFiscalYearLabel: string;
} {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  const fiscalYearMatch = baseName.match(/\bFY[\s_-]*([0-9]{1,4})\b/i);
  if (!fiscalYearMatch) {
    throw new Error("Filename must include a fiscal year token like FY27");
  }

  const sourceFiscalYearLabel = normalizeFiscalYearLabel(`FY${fiscalYearMatch[1]}`);

  const withoutFiscalYear = baseName
    .replace(fiscalYearMatch[0], " ")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const doctorTokenMatch = withoutFiscalYear.match(/[A-Za-z0-9]+/);
  if (!doctorTokenMatch) {
    throw new Error("Filename must include a doctor token");
  }

  return {
    sourceDoctorToken: doctorTokenMatch[0],
    sourceFiscalYearLabel,
  };
}

function normalizeHex(hex: string): string {
  return hex.trim().replace(/^#/, "").toUpperCase();
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = normalizeHex(hex);
  const rgb = normalized.length === 8 ? normalized.slice(2) : normalized;
  if (rgb.length !== 6) return { h: 0, s: 0, l: 0 };

  const r = parseInt(rgb.slice(0, 2), 16) / 255;
  const g = parseInt(rgb.slice(2, 4), 16) / 255;
  const b = parseInt(rgb.slice(4, 6), 16) / 255;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { h: 0, s: 0, l: 0 };
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + 6) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return { h, s, l };
}

function fuzzyClassifyColor(hex: string): UploadAvailability | null {
  const normalized = normalizeHex(hex);
  if (normalized.length < 6) return null;

  const { h, s, l } = hexToHsl(normalized);
  if (s < 0.15 || l < 0.1 || l > 0.95) {
    return null;
  }

  if (h <= 15 || h >= 345) return "red";
  if (h >= 30 && h <= 70) return "yellow";
  if (h >= 80 && h <= 170) return "green";
  return null;
}

export function classifyColor(hex: string | null | undefined): UploadAvailability {
  if (!hex) return "unset";
  const normalized = normalizeHex(hex);

  if (EXACT_COLOR_MAP[normalized]) {
    return EXACT_COLOR_MAP[normalized];
  }

  return fuzzyClassifyColor(normalized) ?? "unset";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function excelSerialToIsoDate(serial: number): string {
  const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
  const date = new Date(utcMs);
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function dateToIsoDate(date: Date): string {
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseDateLikeString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const isoDateTimeMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T/);
  if (isoDateTimeMatch) {
    return formatDateParts(
      Number(isoDateTimeMatch[1]),
      Number(isoDateTimeMatch[2]),
      Number(isoDateTimeMatch[3]),
    );
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const yearRaw = Number(usMatch[3]);
    const year = usMatch[3].length === 2 ? 2000 + yearRaw : yearRaw;
    return formatDateParts(year, month, day);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateToIsoDate(parsed);
}

function parseDateLikeValue(value: unknown): string | null {
  if (value instanceof Date) {
    return dateToIsoDate(value);
  }

  if (typeof value === "number") {
    return excelSerialToIsoDate(value);
  }

  if (typeof value === "string") {
    return parseDateLikeString(value);
  }

  return null;
}

function parseDateCell(cell: XLSX.CellObject | undefined): string | null {
  if (!cell) return null;

  if (cell.t === "d" && cell.v instanceof Date) {
    return dateToIsoDate(cell.v);
  }

  if (cell.t === "n" && typeof cell.v === "number") {
    return excelSerialToIsoDate(cell.v);
  }

  if (typeof cell.w === "string") {
    const fromDisplay = parseDateLikeString(cell.w);
    if (fromDisplay) return fromDisplay;
  }

  if (typeof cell.v === "string") {
    const fromValue = parseDateLikeString(cell.v);
    if (fromValue) return fromValue;
  }

  return null;
}

function parsePreferenceValue(raw: unknown): UploadAvailability | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "red") return "red";
  if (normalized === "yellow") return "yellow";
  if (normalized === "green") return "green";
  if (normalized === "unset") return "unset";
  return null;
}

function getCounts(rows: ParsedImportRow[]): Record<UploadAvailability, number> {
  const counts: Record<UploadAvailability, number> = {
    red: 0,
    yellow: 0,
    green: 0,
    unset: 0,
  };

  for (const row of rows) {
    counts[row.availability] += 1;
  }

  return counts;
}

function ensureNoDuplicateWeeks(rows: ParsedImportRow[]) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const previous = seen.get(row.weekStart);
    if (previous !== undefined) {
      throw new Error(
        `Duplicate week_start ${row.weekStart} found in rows ${previous} and ${row.sourceRow}`,
      );
    }
    seen.set(row.weekStart, row.sourceRow);
  }
}

function parseCsvRows(sheet: XLSX.WorkSheet): ParsedImportRow[] {
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  if (matrix.length === 0) {
    throw new Error("CSV file is empty");
  }

  const headerRow = matrix[0] ?? [];
  const normalizedHeaders = headerRow.map((value) => String(value).trim().toLowerCase());

  const weekStartIndex = normalizedHeaders.indexOf("week_start");
  const preferenceIndex = normalizedHeaders.indexOf("preference");
  const weekEndIndex = normalizedHeaders.indexOf("week_end");

  if (weekStartIndex < 0 || preferenceIndex < 0) {
    throw new Error("CSV must include headers: week_start, preference");
  }

  const rows: ParsedImportRow[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const sourceRow = i + 1;
    const row = matrix[i] ?? [];

    const values = row.map((value) => String(value ?? "").trim());
    if (values.every((value) => value.length === 0)) {
      continue;
    }

    const weekStartRaw = String(row[weekStartIndex] ?? "").trim();
    const weekStart = parseDateLikeValue(row[weekStartIndex]);
    if (!weekStart) {
      throw new Error(`Row ${sourceRow}: invalid week_start \"${weekStartRaw}\"`);
    }

    const preferenceRaw = String(row[preferenceIndex] ?? "").trim();
    const availability = parsePreferenceValue(preferenceRaw);
    if (!availability) {
      throw new Error(
        `Row ${sourceRow}: preference must be one of ${AVAILABILITY_VALUES.join(", ")} (received \"${preferenceRaw}\")`,
      );
    }

    let weekEnd: string | null = null;
    if (weekEndIndex >= 0) {
      const weekEndRaw = String(row[weekEndIndex] ?? "").trim();
      if (weekEndRaw.length > 0) {
        weekEnd = parseDateLikeValue(row[weekEndIndex]);
        if (!weekEnd) {
          throw new Error(`Row ${sourceRow}: invalid week_end \"${weekEndRaw}\"`);
        }
      }
    }

    rows.push({
      weekStart,
      weekEnd,
      availability,
      sourceRow,
    });
  }

  if (rows.length === 0) {
    throw new Error("CSV must include at least one non-empty data row");
  }

  ensureNoDuplicateWeeks(rows);
  return rows;
}

function parseWorkbookRows(workbook: XLSX.WorkBook): ParsedImportRow[] {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Workbook is empty");
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet || !sheet["!ref"]) {
    throw new Error("Workbook has no readable cells");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows: ParsedImportRow[] = [];

  for (let r = 1; r <= range.e.r; r += 1) {
    const rowNumber = r + 1;
    const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })] as XLSX.CellObject | undefined;
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })] as XLSX.CellObject | undefined;
    const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })] as (XLSX.CellObject & {
      s?: {
        fgColor?: { rgb?: string; argb?: string };
        bgColor?: { rgb?: string; argb?: string };
      };
    }) | undefined;

    const weekStart = parseDateCell(cellA);
    if (!weekStart) continue;

    const weekEnd = parseDateCell(cellB);

    let availability: UploadAvailability = "unset";
    const foregroundHex = cellC?.s?.fgColor?.rgb ?? cellC?.s?.fgColor?.argb;
    if (foregroundHex) {
      availability = classifyColor(foregroundHex);
    }

    if (availability === "unset") {
      const backgroundHex = cellC?.s?.bgColor?.rgb ?? cellC?.s?.bgColor?.argb;
      if (backgroundHex) {
        availability = classifyColor(backgroundHex);
      }
    }

    rows.push({
      weekStart,
      weekEnd,
      availability,
      sourceRow: rowNumber,
    });
  }

  if (rows.length === 0) {
    throw new Error("Workbook did not contain any dated rows in column A");
  }

  ensureNoDuplicateWeeks(rows);
  return rows;
}

export function parseScheduleImportCsvText(csvText: string, fileName: string): ParsedUploadPayload {
  const metadata = parseUploadMetadataFromFileName(fileName);
  const workbook = XLSX.read(csvText, { type: "string", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error("CSV file is empty");
  }

  const weeks = parseCsvRows(sheet);

  return {
    sourceFileName: fileName,
    sourceDoctorToken: metadata.sourceDoctorToken,
    sourceFiscalYearLabel: metadata.sourceFiscalYearLabel,
    weeks,
    counts: getCounts(weeks),
  };
}

export function parseScheduleImportWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
): ParsedUploadPayload {
  const metadata = parseUploadMetadataFromFileName(fileName);
  const weeks = parseWorkbookRows(workbook);

  return {
    sourceFileName: fileName,
    sourceDoctorToken: metadata.sourceDoctorToken,
    sourceFiscalYearLabel: metadata.sourceFiscalYearLabel,
    weeks,
    counts: getCounts(weeks),
  };
}

export async function parseScheduleImportFile(file: File): Promise<ParsedUploadPayload> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xlsx") {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), {
      type: "array",
      cellStyles: true,
      cellDates: true,
    });
    return parseScheduleImportWorkbook(workbook, file.name);
  }

  if (extension === "csv") {
    const csvText = await file.text();
    return parseScheduleImportCsvText(csvText, file.name);
  }

  throw new Error("Unsupported file type. Upload either .xlsx or .csv");
}
