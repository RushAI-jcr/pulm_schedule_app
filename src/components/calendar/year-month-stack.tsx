"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { getRotationAccent } from "./calendar-tokens"
import {
  buildMonthGrid,
  deriveFiscalMonths,
  monthAnchorId,
  toLocalDate,
  toISODate,
  isSameDay,
  type GridRow,
  type EventCategory,
} from "./calendar-grid-utils"
import { useToday } from "@/hooks/use-today"
import type { Id } from "../../../convex/_generated/dataModel"

type Rotation = {
  _id: Id<"rotations">
  name: string
  abbreviation: string
}

type CalendarEvent = {
  weekId: Id<"weeks">
  date: string
  name: string
  category: EventCategory
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function YearMonthStack({
  grid,
  rotations,
  events,
  physicianId,
  visibleRotationIds,
  onWeekClick,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  visibleRotationIds?: Set<string> | null
  onWeekClick?: (weekNumber: number) => void
}) {
  const today = useToday()

  const fiscalMonths = useMemo(() => deriveFiscalMonths(grid), [grid])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, [])
      map.get(event.date)!.push(event)
    }
    return map
  }, [events])

  // Hoist buildMonthGrid calls — avoids recomputing on every re-render when grid is stable
  const monthGrids = useMemo(
    () =>
      fiscalMonths.map(({ month, year }) => ({
        month,
        year,
        calendarWeeks: buildMonthGrid(year, month, grid),
      })),
    [fiscalMonths, grid]
  )

  // Pre-build rotation lookup for O(1) access in pill render
  const rotationMap = useMemo(() => {
    const map = new Map<string, { rotation: Rotation; index: number }>()
    rotations.forEach((r, i) => map.set(String(r._id), { rotation: r, index: i }))
    return map
  }, [rotations])

  if (grid.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No published calendar data available for this fiscal year.
      </p>
    )
  }

  return (
    <>
      {/* Desktop: 12-month stacked vertical layout */}
      <div className="hidden md:block space-y-10">
        {monthGrids.map(({ month, year, calendarWeeks }) => {
          if (calendarWeeks.length === 0) return null

          return (
            <div key={`${year}-${month}`} id={monthAnchorId(year, month)}>
              {/* Month header */}
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {MONTH_NAMES[month]}
                </h2>
                <span className="text-sm text-muted-foreground">{year}</span>
              </div>

              {/* Calendar grid */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                {/* Day-of-week header */}
                <div className="grid grid-cols-7 border-b bg-muted/30">
                  {DAY_LABELS.map((label) => (
                    <div
                      key={label}
                      className="py-2 text-center text-xs font-semibold text-muted-foreground tracking-wide"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                {/* Week rows */}
                {calendarWeeks.map(({ days, gridRow }, weekIdx) => {
                  const isCurrentWeek = days.some((d) => isSameDay(d, today))
                  const weekNumber = gridRow?.weekNumber

                  return (
                    <div
                      key={weekIdx}
                      className={cn(
                        "border-b last:border-0",
                        isCurrentWeek && "bg-primary/5"
                      )}
                    >
                      {/* Day number row */}
                      <div className="grid grid-cols-7">
                        {days.map((day, dayIdx) => {
                          const inMonth = day.getMonth() === month
                          const isToday = isSameDay(day, today)
                          const dateStr = toISODate(day)
                          const dayEvents = eventsByDate.get(dateStr) ?? []

                          return (
                            <button
                              key={dayIdx}
                              className={cn(
                                "relative px-2 pt-2 pb-1 min-h-[3rem] text-left transition-colors",
                                dayIdx < 6 && "border-r border-border/30",
                                !inMonth && "bg-muted/20",
                                inMonth && !isToday && "hover:bg-muted/40 cursor-pointer"
                              )}
                              onClick={() => {
                                if (weekNumber !== undefined) onWeekClick?.(weekNumber)
                              }}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                                  isToday &&
                                    "bg-primary text-primary-foreground font-semibold shadow-sm ring-2 ring-primary/30 ring-offset-1",
                                  !isToday && inMonth && "text-foreground",
                                  !isToday && !inMonth && "text-muted-foreground/35"
                                )}
                              >
                                {day.getDate()}
                              </span>
                              {/* Event dots */}
                              {dayEvents.length > 0 && (
                                <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
                                  {dayEvents.map((e, ei) => (
                                    <span
                                      key={ei}
                                      title={e.name}
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        e.category === "federal_holiday"
                                          ? "bg-rose-500"
                                          : e.category === "conference"
                                            ? "bg-sky-500"
                                            : "bg-amber-500"
                                      )}
                                    />
                                  ))}
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Assignment pills row */}
                      {gridRow ? (
                        <div className="px-3 pb-3 pt-1">
                          <div className="flex flex-wrap gap-1.5">
                            {gridRow.cells
                              .filter(
                                (cell) =>
                                  !visibleRotationIds ||
                                  visibleRotationIds.has(String(cell.rotationId))
                              )
                              .map((cell) => {
                                const entry = rotationMap.get(String(cell.rotationId))
                                if (!entry) return null
                                const { rotation, index: rotIdx } = entry
                                const accent = getRotationAccent(rotIdx)
                                const isMe =
                                  !!physicianId &&
                                  String(cell.physicianId) === String(physicianId)
                                const dimmed = !!physicianId && !isMe

                                return (
                                  <div
                                    key={String(cell.rotationId)}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 border-l-[3px] rounded-sm px-2 py-0.5 text-xs font-medium transition-opacity",
                                      accent.borderL,
                                      accent.subtleBg,
                                      dimmed && "opacity-25"
                                    )}
                                  >
                                    <span className="font-semibold text-foreground">
                                      {rotation.abbreviation}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {cell.physicianInitials ?? "–"}
                                    </span>
                                    {isMe && (
                                      <span
                                        className={cn("h-1.5 w-1.5 rounded-full", accent.dot)}
                                      />
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                          {/* Event names for this week */}
                          {days.some(
                            (d) => (eventsByDate.get(toISODate(d)) ?? []).length > 0
                          ) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {days.flatMap((d) =>
                                (eventsByDate.get(toISODate(d)) ?? []).map((e, i) => (
                                  <span
                                    key={`${toISODate(d)}-${i}`}
                                    className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                      e.category === "federal_holiday"
                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                                        : e.category === "conference"
                                          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                    )}
                                  >
                                    {e.name}
                                  </span>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="px-3 pb-3 pt-1">
                          <p className="text-xs text-muted-foreground/40 italic">
                            No assignments
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: vertical week cards */}
      <div className="md:hidden space-y-2">
        {grid.map((row) => {
          const weekEvents: CalendarEvent[] = []
          for (const day of enumerateWeekDays(row.startDate)) {
            const dayEvts = eventsByDate.get(day) ?? []
            weekEvents.push(...dayEvts)
          }
          const myAssignment = physicianId
            ? row.cells.find((c) => String(c.physicianId) === String(physicianId))
            : null
          const isCurrentWeek =
            today >= toLocalDate(row.startDate) && today <= toLocalDate(row.endDate)

          const startD = toLocalDate(row.startDate)
          const endD = toLocalDate(row.endDate)
          const dateLabel = `${startD.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })} – ${endD.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

          return (
            <button
              key={row.weekNumber}
              className={cn(
                "w-full text-left rounded-xl border p-3 hover:bg-accent/50 transition-colors",
                isCurrentWeek && "border-primary/40 bg-primary/5"
              )}
              onClick={() => onWeekClick?.(row.weekNumber)}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-semibold", isCurrentWeek && "text-primary")}>
                  {dateLabel}
                </span>
                {isCurrentWeek && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    This week
                  </span>
                )}
              </div>
              {myAssignment && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {rotationMap.get(String(myAssignment.rotationId))?.rotation.name ?? "Unknown"}
                </p>
              )}
              {!physicianId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.cells.filter((c) => c.physicianId).length} assignments
                </p>
              )}
              {weekEvents.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {weekEvents.map((e, i) => (
                    <span
                      key={i}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        e.category === "federal_holiday"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                          : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
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
    </>
  )
}

// Helper: enumerate 7 ISO date strings for a week starting at startDate (Monday)
function enumerateWeekDays(startDate: string): string[] {
  const days: string[] = []
  const cursor = toLocalDate(startDate)
  for (let i = 0; i < 7; i++) {
    days.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
