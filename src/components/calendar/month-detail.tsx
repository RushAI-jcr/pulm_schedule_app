"use client"

import { useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/components/ui/button"
import { getRotationAccent } from "./calendar-tokens"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  buildMonthGrid,
  inferYearForMonth,
  deriveFiscalMonths,
  toLocalDate,
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
  activeMonth,
  onMonthChange,
  onBackToYear,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  visibleRotationIds?: Set<string> | null
  activeMonth: number
  onMonthChange: (month: number) => void
  onBackToYear: () => void
}) {
  const today = useToday()

  const activeYear = useMemo(
    () => inferYearForMonth(activeMonth, grid),
    [activeMonth, grid]
  )

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
            onClick={() => prevEntry && onMonthChange(prevEntry.month)}
            disabled={!prevEntry}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-base font-semibold min-w-[160px] text-center">{monthLabel}</h3>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => nextEntry && onMonthChange(nextEntry.month)}
            disabled={!nextEntry}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-16" />
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
        {calendarWeeks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No weeks found for this month.
          </p>
        ) : (
          calendarWeeks.map(({ days, gridRow }, weekIdx) => {
            const isCurrentWeek = days.some((d) => isSameDay(d, today))
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
                    const inMonth = day.getMonth() === activeMonth
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

                {/* Assignment pills row — spans full week */}
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
                          const rotIdx = rotations.findIndex(
                            (r) => String(r._id) === String(cell.rotationId)
                          )
                          if (rotIdx === -1) return null
                          const rotation = rotations[rotIdx]
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
                                <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
                              )}
                            </div>
                          )
                        })}
                    </div>
                    {/* Holiday names for this week */}
                    {days.some((d) => (eventsByDate.get(toISODate(d)) ?? []).length > 0) && (
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
                    <p className="text-xs text-muted-foreground/50 italic">No assignments</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
