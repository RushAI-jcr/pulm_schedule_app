import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

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

type XlsxCellColor = {
  fg: string | null;
  bg: string | null;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
});

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

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

function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCsvRows(csvText: string): ParsedImportRow[] {
  const matrix = parseCsvMatrix(csvText);

  if (matrix.length === 0) {
    throw new Error("CSV file is empty");
  }
  if (matrix.length - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`CSV exceeds maximum supported rows (${MAX_IMPORT_ROWS})`);
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

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function readXmlText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (!node || typeof node !== "object") {
    return "";
  }

  const textNode = (node as Record<string, unknown>)["#text"];
  if (typeof textNode === "string" || typeof textNode === "number") {
    return String(textNode);
  }

  return "";
}

function readColorAttr(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const colorNode = node as Record<string, unknown>;
  const rgb = colorNode["@_rgb"];
  if (typeof rgb === "string") return rgb;
  const argb = colorNode["@_argb"];
  if (typeof argb === "string") return argb;
  return null;
}

function normalizeXlsxPath(path: string): string {
  const base = path.replace(/^\/+/, "");
  const prefixed = base.startsWith("xl/") ? base : `xl/${base}`;

  const parts: string[] = [];
  for (const segment of prefixed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }

  return parts.join("/");
}

function parseXmlFile(files: Record<string, Uint8Array>, path: string): Record<string, unknown> {
  const normalizedPath = normalizeXlsxPath(path);
  const bytes = files[normalizedPath];
  if (!bytes) {
    throw new Error(`Workbook is missing required file: ${normalizedPath}`);
  }

  const xml = strFromU8(bytes);
  return xmlParser.parse(xml) as Record<string, unknown>;
}

function getSharedStrings(files: Record<string, Uint8Array>): string[] {
  const sharedStringBytes = files["xl/sharedStrings.xml"];
  if (!sharedStringBytes) return [];

  const sharedStringsDoc = xmlParser.parse(strFromU8(sharedStringBytes)) as Record<string, unknown>;
  const siNodes = asArray((sharedStringsDoc.sst as Record<string, unknown> | undefined)?.si);

  return siNodes.map((siNode) => {
    if (!siNode || typeof siNode !== "object") return "";
    const si = siNode as Record<string, unknown>;

    if (si.t !== undefined) {
      return readXmlText(si.t);
    }

    const richTextNodes = asArray(si.r);
    return richTextNodes
      .map((richTextNode) => {
        if (!richTextNode || typeof richTextNode !== "object") return "";
        return readXmlText((richTextNode as Record<string, unknown>).t);
      })
      .join("");
  });
}

function getStyleColors(files: Record<string, Uint8Array>): Map<number, XlsxCellColor> {
  const styleBytes = files["xl/styles.xml"];
  if (!styleBytes) return new Map<number, XlsxCellColor>();

  const stylesDoc = xmlParser.parse(strFromU8(styleBytes)) as Record<string, unknown>;
  const styleSheet = stylesDoc.styleSheet as Record<string, unknown> | undefined;
  const fillNodes = asArray((styleSheet?.fills as Record<string, unknown> | undefined)?.fill);
  const xfNodes = asArray((styleSheet?.cellXfs as Record<string, unknown> | undefined)?.xf);

  const fills = fillNodes.map((fillNode) => {
    if (!fillNode || typeof fillNode !== "object") {
      return { fg: null, bg: null } satisfies XlsxCellColor;
    }

    const patternFill = (fillNode as Record<string, unknown>).patternFill as Record<string, unknown> | undefined;
    return {
      fg: readColorAttr(patternFill?.fgColor),
      bg: readColorAttr(patternFill?.bgColor),
    } satisfies XlsxCellColor;
  });

  const colorsByStyle = new Map<number, XlsxCellColor>();
  xfNodes.forEach((xfNode, styleIndex) => {
    if (!xfNode || typeof xfNode !== "object") return;
    const fillIdRaw = (xfNode as Record<string, unknown>)["@_fillId"];
    const fillId = Number(fillIdRaw);
    if (!Number.isFinite(fillId) || fillId < 0 || fillId >= fills.length) {
      return;
    }
    colorsByStyle.set(styleIndex, fills[fillId]);
  });

  return colorsByStyle;
}

function getFirstWorksheetPath(files: Record<string, Uint8Array>): string {
  const workbookDoc = parseXmlFile(files, "xl/workbook.xml");
  const workbook = workbookDoc.workbook as Record<string, unknown> | undefined;
  const sheetsNode = workbook?.sheets as Record<string, unknown> | undefined;
  const sheetNodes = asArray(sheetsNode?.sheet);

  if (sheetNodes.length === 0) {
    throw new Error("Workbook has no sheets");
  }

  const firstSheet = sheetNodes[0] as Record<string, unknown>;
  const relationshipId =
    typeof firstSheet["@_r:id"] === "string" ? (firstSheet["@_r:id"] as string) : null;

  if (!relationshipId) {
    const sheetId = Number(firstSheet["@_sheetId"]);
    if (!Number.isFinite(sheetId)) {
      throw new Error("Workbook sheet relationship is missing");
    }
    return `xl/worksheets/sheet${sheetId}.xml`;
  }

  const relationshipsDoc = parseXmlFile(files, "xl/_rels/workbook.xml.rels");
  const relNodes = asArray(
    (relationshipsDoc.Relationships as Record<string, unknown> | undefined)?.Relationship,
  );

  const relationship = relNodes.find((relNode) => {
    if (!relNode || typeof relNode !== "object") return false;
    return (relNode as Record<string, unknown>)["@_Id"] === relationshipId;
  }) as Record<string, unknown> | undefined;

  const target = typeof relationship?.["@_Target"] === "string" ? relationship["@_Target"] : null;
  if (!target) {
    throw new Error("Workbook sheet relationship target is missing");
  }

  return normalizeXlsxPath(target);
}

function coerceXlsxCellValue(cell: Record<string, unknown>, sharedStrings: string[]): unknown {
  const type = typeof cell["@_t"] === "string" ? (cell["@_t"] as string) : undefined;

  if (type === "inlineStr") {
    const isNode = cell.is as Record<string, unknown> | undefined;
    if (!isNode) return null;
    return readXmlText(isNode.t);
  }

  const rawValueText = readXmlText(cell.v);

  if (type === "s") {
    const sharedStringIndex = Number(rawValueText);
    return Number.isFinite(sharedStringIndex) ? (sharedStrings[sharedStringIndex] ?? "") : "";
  }

  if (type === "str" || type === "d") {
    return rawValueText;
  }

  if (rawValueText.length === 0) {
    return null;
  }

  const numeric = Number(rawValueText);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return rawValueText;
}

function parseXlsxRows(xlsxBytes: ArrayBuffer): ParsedImportRow[] {
  const files = unzipSync(new Uint8Array(xlsxBytes));
  const sharedStrings = getSharedStrings(files);
  const styleColors = getStyleColors(files);
  const worksheetPath = getFirstWorksheetPath(files);
  const sheetDoc = parseXmlFile(files, worksheetPath);

  const worksheet = sheetDoc.worksheet as Record<string, unknown> | undefined;
  const sheetData = worksheet?.sheetData as Record<string, unknown> | undefined;
  const rowNodes = asArray(sheetData?.row);

  if (rowNodes.length === 0) {
    throw new Error("Workbook did not contain any rows");
  }

  if (rowNodes.length - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`Workbook exceeds maximum supported rows (${MAX_IMPORT_ROWS})`);
  }

  const rows: ParsedImportRow[] = [];

  for (const rowNode of rowNodes) {
    if (!rowNode || typeof rowNode !== "object") continue;
    const row = rowNode as Record<string, unknown>;
    const sourceRow = Number(row["@_r"]);
    if (!Number.isFinite(sourceRow) || sourceRow <= 1) continue;

    const cells = asArray(row.c);
    const cellByColumn = new Map<string, Record<string, unknown>>();

    for (const cellNode of cells) {
      if (!cellNode || typeof cellNode !== "object") continue;
      const cell = cellNode as Record<string, unknown>;
      const ref = typeof cell["@_r"] === "string" ? (cell["@_r"] as string) : "";
      const colMatch = ref.match(/^([A-Z]+)/);
      if (!colMatch) continue;
      cellByColumn.set(colMatch[1], cell);
    }

    const weekStartCell = cellByColumn.get("A");
    const weekStart = parseDateLikeValue(
      weekStartCell ? coerceXlsxCellValue(weekStartCell, sharedStrings) : null,
    );
    if (!weekStart) continue;

    const weekEndCell = cellByColumn.get("B");
    const weekEnd = parseDateLikeValue(
      weekEndCell ? coerceXlsxCellValue(weekEndCell, sharedStrings) : null,
    );

    const preferenceCell = cellByColumn.get("C");
    const preferenceText = preferenceCell
      ? coerceXlsxCellValue(preferenceCell, sharedStrings)
      : null;

    let availability: UploadAvailability = parsePreferenceValue(preferenceText) ?? "unset";

    if (availability === "unset" && preferenceCell) {
      const styleIndex = Number(preferenceCell["@_s"]);
      if (Number.isFinite(styleIndex) && styleColors.has(styleIndex)) {
        const colors = styleColors.get(styleIndex)!;
        if (colors.fg) {
          availability = classifyColor(colors.fg);
        }
        if (availability === "unset" && colors.bg) {
          availability = classifyColor(colors.bg);
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
    throw new Error("Workbook did not contain any dated rows in column A");
  }

  ensureNoDuplicateWeeks(rows);
  return rows;
}

export function parseScheduleImportCsvText(csvText: string, fileName: string): ParsedUploadPayload {
  const metadata = parseUploadMetadataFromFileName(fileName);
  const weeks = parseCsvRows(csvText);

  return {
    sourceFileName: fileName,
    sourceDoctorToken: metadata.sourceDoctorToken,
    sourceFiscalYearLabel: metadata.sourceFiscalYearLabel,
    weeks,
    counts: getCounts(weeks),
  };
}

export function parseScheduleImportXlsxBytes(
  xlsxBytes: ArrayBuffer,
  fileName: string,
): ParsedUploadPayload {
  const metadata = parseUploadMetadataFromFileName(fileName);
  const weeks = parseXlsxRows(xlsxBytes);

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
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(file.size / 1024)}KB). Max size is ${Math.round(MAX_IMPORT_FILE_BYTES / 1024)}KB.`,
    );
  }

  if (extension === "xlsx") {
    const data = await file.arrayBuffer();
    return parseScheduleImportXlsxBytes(data, file.name);
  }

  if (extension === "csv") {
    const csvText = await file.text();
    return parseScheduleImportCsvText(csvText, file.name);
  }

  throw new Error("Unsupported file type. Upload either .xlsx or .csv");
}
