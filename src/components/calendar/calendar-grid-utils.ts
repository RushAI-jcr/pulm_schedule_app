/**
 * Shared pure utility functions for the calendar month/year views.
 * All functions are framework-free (no React, no Convex runtime).
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface GridCell {
  rotationId: string
  assignmentId?: string | null
  physicianId?: string | null
  physicianName?: string | null
  physicianInitials?: string | null
}

export interface GridRow {
  weekId: string
  weekNumber: number
  startDate: string // ISO "YYYY-MM-DD"
  endDate: string   // ISO "YYYY-MM-DD"
  cells: GridCell[]
}

// ────────────────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────────────────

/** Parse an ISO "YYYY-MM-DD" string into a local-time Date (no UTC offset). */
export function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Serialize a local-time Date to "YYYY-MM-DD". */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** True if two dates fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Fiscal-calendar helpers
// ────────────────────────────────────────────────────────────────────────────

/** Returns the DOM element ID for a month section in the year-stack view. */
export function monthAnchorId(year: number, month: number): string {
  return `month-${year}-${month}`
}

/**
 * Derive the ordered list of unique calendar months covered by the grid.
 * Each entry contains the calendar month (0-based), year, and a display label.
 */
export function deriveFiscalMonths(
  grid: GridRow[],
): Array<{ month: number; year: number; label: string }> {
  const seen = new Set<string>()
  const months: Array<{ month: number; year: number; label: string }> = []
  for (const row of grid) {
    const d = toLocalDate(row.startDate)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!seen.has(key)) {
      seen.add(key)
      months.push({
        month: d.getMonth(),
        year: d.getFullYear(),
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      })
    }
  }
  return months
}

/**
 * Given a 0-based calendar month and the fiscal grid, return the year
 * that month occurs in. Falls back to the current year if not found.
 */
export function inferYearForMonth(month: number, grid: GridRow[]): number {
  for (const row of grid) {
    const d = toLocalDate(row.startDate)
    if (d.getMonth() === month) return d.getFullYear()
  }
  return new Date().getFullYear()
}

/**
 * Build a calendar-month grid for the given year/month from the fiscal data.
 *
 * Returns an array of week rows (Mon–Sun), where each row contains:
 *   - `days`: 7 Date objects for the week
 *   - `gridRow`: the matching fiscal week, or null if that calendar week
 *     is outside the fiscal year
 *
 * The first row starts on the Monday at or before the 1st of the month;
 * the last row ends on the Sunday at or after the last day of the month.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  grid: GridRow[],
): Array<{ days: Date[]; gridRow: GridRow | null }> {
  // O(1) lookup: week-start ISO date → GridRow
  const gridByStart = new Map<string, GridRow>()
  for (const row of grid) {
    gridByStart.set(row.startDate, row)
  }

  // Find the Monday at or before the 1st of the month
  const firstDay = new Date(year, month, 1)
  const dayOfWeek = firstDay.getDay() // 0=Sun, 1=Mon, …, 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const firstMonday = new Date(year, month, 1 - daysToMonday)

  const lastDay = new Date(year, month + 1, 0) // last calendar day of month
  const result: Array<{ days: Date[]; gridRow: GridRow | null }> = []

  const cursor = new Date(firstMonday)
  while (cursor <= lastDay) {
    const weekStartStr = toISODate(cursor)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    result.push({ days, gridRow: gridByStart.get(weekStartStr) ?? null })
    cursor.setDate(cursor.getDate() + 7)
  }

  return result
}
