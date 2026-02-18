"use client"

import { useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/components/ui/button"
import { getRotationAccent } from "./calendar-tokens"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  buildMonthGrid,
  deriveFiscalMonths,
  toISODate,
  isSameDay,
  type GridRow,
  type EventCategory,
} from "./calendar-grid-utils"
import { useToday } from "@/hooks/use-today"

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

export function MonthDetail({
  grid,
  rotations,
  events,
  physicianId,
  visibleRotationIds,
  activePeriod,
  onMonthChange,
  onBackToYear,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  visibleRotationIds?: Set<string> | null
  activePeriod: { month: number; year: number }
  onMonthChange: (month: number, year: number) => void
  onBackToYear: () => void
}) {
  const today = useToday()
  const activeMonth = activePeriod.month
  const activeYear = activePeriod.year

  const calendarWeeks = useMemo(
    () => buildMonthGrid(activeYear, activeMonth, grid),
    [activeYear, activeMonth, grid]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, [])
      map.get(event.date)!.push(event)
    }
    return map
  }, [events])

  const monthLabel = new Date(activeYear, activeMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const fiscalMonths = useMemo(() => deriveFiscalMonths(grid), [grid])
  const rotationMap = useMemo(() => {
    const map = new Map<string, { rotation: Rotation; index: number }>()
    rotations.forEach((rotation, index) =>
      map.set(String(rotation._id), { rotation, index })
    )
    return map
  }, [rotations])

  const currentIndex = fiscalMonths.findIndex(
    (m) => m.month === activeMonth && m.year === activeYear
  )
  const prevEntry = currentIndex > 0 ? fiscalMonths[currentIndex - 1] : null
  const nextEntry =
    currentIndex < fiscalMonths.length - 1 ? fiscalMonths[currentIndex + 1] : null

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBackToYear} className="text-muted-foreground">
          ← Year
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => prevEntry && onMonthChange(prevEntry.month, prevEntry.year)}
            disabled={!prevEntry}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-base font-semibold min-w-[160px] text-center">{monthLabel}</h3>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => nextEntry && onMonthChange(nextEntry.month, nextEntry.year)}
            disabled={!nextEntry}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-16" />
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <div className="min-w-[920px] overflow-hidden">
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
          {calendarWeeks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No weeks found for this month.
            </p>
          ) : (
            calendarWeeks.map(({ days, gridRow }, weekIdx) => {
              const isCurrentWeek = days.some((d) => isSameDay(d, today))
              const weekAssignments = gridRow
                ? gridRow.cells
                    .filter(
                      (cell) =>
                        !visibleRotationIds ||
                        visibleRotationIds.has(String(cell.rotationId))
                    )
                    .filter(
                      (cell) =>
                        !physicianId ||
                        String(cell.physicianId) === String(physicianId)
                    )
                : []
              const weekRangeLabel = formatWeekRangeLabel(days)
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
                      const inMonth =
                        day.getMonth() === activeMonth && day.getFullYear() === activeYear
                      const isToday = isSameDay(day, today)
                      const dateStr = toISODate(day)
                      const dayEvents = eventsByDate.get(dateStr) ?? []

                      return (
                        <div
                          key={dayIdx}
                          className={cn(
                            "relative px-2 pt-2 pb-1 min-h-[3rem]",
                            dayIdx < 6 && "border-r border-border/30",
                            !inMonth && "bg-muted/20"
                          )}
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
                        </div>
                      )
                    })}
                  </div>

                  {/* Week-long rotation bars */}
                  {gridRow ? (
                    <div className="px-3 pb-3 pt-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                          Week-long rotations
                        </span>
                        <span className="text-xs text-muted-foreground">{weekRangeLabel}</span>
                      </div>

                      <div className="space-y-2">
                        {weekAssignments.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic">
                            {physicianId ? "No assignment for this week" : "No assignments"}
                          </p>
                        ) : (
                          weekAssignments.map((cell) => {
                            const entry = rotationMap.get(String(cell.rotationId))
                            if (!entry) return null
                            const { rotation, index } = entry
                            const accent = getRotationAccent(index)

                            return (
                              <div
                                key={String(cell.rotationId)}
                                className={cn(
                                  "relative overflow-hidden rounded-md border border-border/45 px-3 py-2.5",
                                  accent.subtleBg
                                )}
                              >
                                <span
                                  className={cn(
                                    "absolute inset-y-0 left-0 w-1.5 rounded-l-md",
                                    accent.dot
                                  )}
                                />
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,220px)] items-center gap-3 pl-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                                      {rotation.abbreviation}
                                    </p>
                                    <p className="truncate text-sm font-semibold text-foreground">
                                      {rotation.name}
                                    </p>
                                  </div>
                                  <div className="min-w-0 rounded-md bg-background/70 px-2.5 py-1.5">
                                    <p className="truncate text-xs text-muted-foreground">
                                      {cell.physicianName ?? "Unassigned physician"}
                                    </p>
                                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                      <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
                                      {cell.physicianInitials ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Holiday names for this week */}
                      {days.some((d) => (eventsByDate.get(toISODate(d)) ?? []).length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
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
                    <div className="px-3 pb-3 pt-2">
                      <p className="text-xs text-muted-foreground/50 italic">No assignments</p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function formatWeekRangeLabel(days: Date[]): string {
  const start = days[0]
  const end = days[days.length - 1]
  const startLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const endLabel = end.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  return `${startLabel} - ${endLabel}`
}
