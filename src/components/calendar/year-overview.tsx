"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { CalendarCell } from "./calendar-cell"
import type { Id } from "../../../convex/_generated/dataModel"

type GridRow = {
  weekId: Id<"weeks">
  weekNumber: number
  startDate: string
  endDate: string
  cells: Array<{
    rotationId: Id<"rotations">
    assignmentId: Id<"assignments"> | null
    physicianId: Id<"physicians"> | null
    physicianName: string | null
    physicianInitials: string | null
  }>
}

type Rotation = {
  _id: Id<"rotations">
  name: string
  abbreviation: string
}

type CalendarEvent = {
  weekId: Id<"weeks">
  date: string
  name: string
  category: string
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short" })
}

function getMonthFromDate(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getMonth()
}

export function YearOverview({
  grid,
  rotations,
  events,
  physicianId,
  onWeekClick,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  onWeekClick?: (weekNumber: number) => void
}) {
  const eventsByWeek = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = String(event.weekId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [events])

  // Group weeks by month for header labels
  const monthBreaks = useMemo(() => {
    const breaks: Array<{ weekIndex: number; label: string }> = []
    let lastMonth = -1
    grid.forEach((row, i) => {
      const month = getMonthFromDate(row.startDate)
      if (month !== lastMonth) {
        breaks.push({ weekIndex: i, label: getMonthLabel(row.startDate) })
        lastMonth = month
      }
    })
    return breaks
  }, [grid])

  if (grid.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No published calendar data available for this fiscal year.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {/* Desktop: compact grid */}
      <div className="hidden md:block overflow-x-auto">
        <div
          className="grid gap-px text-xs"
          style={{
            gridTemplateColumns: `4rem repeat(${grid.length}, minmax(1.75rem, 1fr))`,
          }}
          role="grid"
          aria-label="Year overview calendar"
        >
          {/* Month header row */}
          <div className="sticky left-0 z-10 bg-background" />
          {grid.map((row, i) => {
            const monthBreak = monthBreaks.find((b) => b.weekIndex === i)
            return (
              <div
                key={`month-${i}`}
                className={cn(
                  "text-center text-[10px] text-muted-foreground font-medium pb-0.5",
                  monthBreak && "border-l border-border pl-0.5"
                )}
              >
                {monthBreak?.label ?? ""}
              </div>
            )
          })}

          {/* Week number header row */}
          <div className="sticky left-0 z-10 bg-background text-[10px] text-muted-foreground font-medium px-1">
            Wk
          </div>
          {grid.map((row) => (
            <button
              key={`wk-${row.weekNumber}`}
              className="text-center text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded cursor-pointer transition-colors"
              onClick={() => onWeekClick?.(row.weekNumber)}
              title={`Week ${row.weekNumber}: ${row.startDate} – ${row.endDate}`}
            >
              {row.weekNumber}
            </button>
          ))}

          {/* One row per rotation */}
          {rotations.map((rotation, rotIdx) => (
            <div key={String(rotation._id)} className="contents" role="row">
              <div className="sticky left-0 z-10 bg-background text-[10px] font-semibold px-1 flex items-center truncate">
                {rotation.abbreviation}
              </div>
              {grid.map((row) => {
                const cell = row.cells.find(
                  (c) => String(c.rotationId) === String(rotation._id)
                )
                if (!cell) return <div key={`empty-${row.weekNumber}`} />

                const isHighlighted = !physicianId || String(cell.physicianId) === String(physicianId)

                return (
                  <CalendarCell
                    key={`${row.weekNumber}-${String(rotation._id)}`}
                    cell={cell}
                    rotationIndex={rotIdx}
                    rotationAbbr={rotation.abbreviation}
                    isHighlighted={isHighlighted}
                  />
                )
              })}
            </div>
          ))}

          {/* Events row */}
          <div className="sticky left-0 z-10 bg-background text-[10px] font-semibold px-1 flex items-center text-muted-foreground">
            Events
          </div>
          {grid.map((row) => {
            const weekEvents = eventsByWeek.get(String(row.weekId)) ?? []
            const hasHoliday = weekEvents.some((e) => e.category === "federal_holiday")
            const hasConference = weekEvents.some((e) => e.category === "conference")

            return (
              <div
                key={`ev-${row.weekNumber}`}
                className="flex items-center justify-center gap-0.5"
                title={weekEvents.map((e) => e.name).join(", ")}
              >
                {hasHoliday && (
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Holiday" />
                )}
                {hasConference && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-label="Conference" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: vertical week cards */}
      <div className="md:hidden space-y-2">
        {grid.map((row) => {
          const weekEvents = eventsByWeek.get(String(row.weekId)) ?? []
          const assignedRotations = row.cells.filter((c) => c.physicianId)
          const myAssignment = physicianId
            ? row.cells.find((c) => String(c.physicianId) === String(physicianId))
            : null

          return (
            <button
              key={row.weekNumber}
              className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors"
              onClick={() => onWeekClick?.(row.weekNumber)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Week {row.weekNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {row.startDate} – {row.endDate}
                </span>
              </div>
              {myAssignment && (
                <p className="mt-1 text-sm">
                  {rotations.find((r) => String(r._id) === String(myAssignment.rotationId))?.name ?? "Unknown"}
                </p>
              )}
              {!physicianId && assignedRotations.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {assignedRotations.length} assignment(s)
                </p>
              )}
              {weekEvents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {weekEvents.map((e, i) => (
                    <span
                      key={i}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        e.category === "federal_holiday"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      )}
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
