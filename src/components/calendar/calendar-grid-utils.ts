import type { Id } from "../../../convex/_generated/dataModel"

export type GridRow = {
  weekId: Id<"weeks">
  weekNumber: number
  startDate: string
  endDate: string
  cells: Array<{
    rotationId: Id<"rotations">
    physicianId: Id<"physicians"> | null
    physicianName: string | null
    physicianInitials: string | null
  }>
}

export function toLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00")
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Build a 5–6 row calendar grid for the given month, aligned Mon–Sun
export function buildMonthGrid(year: number, month: number, grid: GridRow[]) {
  const firstOfMonth = new Date(year, month, 1)
  const dow = firstOfMonth.getDay() // 0=Sun 1=Mon … 6=Sat
  const backToMonday = dow === 0 ? 6 : dow - 1
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(firstOfMonth.getDate() - backToMonday)

  const weeks: Array<{ days: Date[]; gridRow: GridRow | undefined }> = []
  const cursor = new Date(gridStart)

  for (let w = 0; w < 6; w++) {
    const days: Date[] = []
    for (let d = 0; d < 7; d++) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    const overlaps = days.some((d) => d.getMonth() === month)
    if (!overlaps) break

    const weekStartStr = toISODate(days[0])
    const gridRow = grid.find((r) => r.startDate === weekStartStr)
    weeks.push({ days, gridRow })
  }

  return weeks
}

// Determine which year the active month belongs to, based on grid data
export function inferYearForMonth(month: number, grid: GridRow[]): number {
  const match = grid.find((r) => toLocalDate(r.startDate).getMonth() === month)
  if (match) return toLocalDate(match.startDate).getFullYear()
  if (grid.length > 0) {
    const mid = grid[Math.floor(grid.length / 2)]
    const midDate = toLocalDate(mid.startDate)
    if (midDate.getMonth() > 6 && month < 6) return midDate.getFullYear() + 1
    return midDate.getFullYear()
  }
  return new Date().getFullYear()
}

// Derive ordered list of fiscal months from grid
export function deriveFiscalMonths(grid: GridRow[]) {
  const seen = new Set<string>()
  const months: Array<{ month: number; year: number }> = []
  for (const row of grid) {
    const d = toLocalDate(row.startDate)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!seen.has(key)) {
      seen.add(key)
      months.push({ month: d.getMonth(), year: d.getFullYear() })
    }
  }
  return months
}

// Scroll to a month anchor in the year stack view
export function scrollToMonth(year: number, month: number) {
  const el = document.getElementById(`month-${year}-${month}`)
  el?.scrollIntoView({ behavior: "smooth", block: "start" })
}
