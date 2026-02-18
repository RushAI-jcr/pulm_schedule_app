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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const CALENDAR_GUIDE_COLUMNS = Array.from({ length: 7 })

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

  const monthGrids = useMemo(
    () =>
      fiscalMonths.map(({ month, year }) => ({
        month,
        year,
        calendarWeeks: buildMonthGrid(year, month, grid),
      })),
    [fiscalMonths, grid]
  )

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
      <div className="hidden md:block space-y-8">
        {monthGrids.map(({ month, year, calendarWeeks }) => {
          if (calendarWeeks.length === 0) return null

          return (
            <section
              key={`${year}-${month}`}
              id={monthAnchorId(year, month)}
              className="overflow-hidden rounded-2xl border bg-card shadow-sm"
            >
              <div className="flex items-center justify-between border-b bg-muted/25 px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {MONTH_NAMES[month]}
                  </h2>
                  <span className="text-sm text-muted-foreground">{year}</span>
                </div>
                <span className="rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {calendarWeeks.length} weeks
                </span>
              </div>

              <div className="divide-y divide-border/70">
                {calendarWeeks.map(({ days, gridRow }, weekIdx) => {
                  const isCurrentWeek = days.some((d) => isSameDay(d, today))
                  const weekNumber = gridRow?.weekNumber
                  const isActionableWeek = weekNumber !== undefined
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
                  const weekEvents = days.flatMap((d) => eventsByDate.get(toISODate(d)) ?? [])

                  return (
                    <button
                      key={weekIdx}
                      type="button"
                      disabled={!isActionableWeek}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors",
                        isCurrentWeek && "bg-primary/5",
                        !isCurrentWeek && isActionableWeek && "hover:bg-muted/20",
                        !isActionableWeek && "cursor-default"
                      )}
                      onClick={() => {
                        if (weekNumber !== undefined) onWeekClick?.(weekNumber)
                      }}
                    >
                      <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-4">
                        <div className="space-y-1.5">
                          <p
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-[0.18em]",
                              isCurrentWeek ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {weekNumber !== undefined ? `Week ${weekNumber}` : "Outside fiscal year"}
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {formatWeekRangeLabel(days)}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {days.map((day, idx) => {
                              const inMonth = day.getMonth() === month && day.getFullYear() === year
                              const dayLabel = day.toLocaleDateString("en-US", {
                                weekday: "narrow",
                              })
                              return (
                                <span
                                  key={`${weekIdx}-${idx}`}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                    isSameDay(day, today)
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border/50 text-muted-foreground",
                                    !inMonth && "opacity-55"
                                  )}
                                >
                                  <span>{dayLabel}</span>
                                  <span>{day.getDate()}</span>
                                </span>
                              )
                            })}
                          </div>
                        </div>

                        <div className="relative overflow-hidden rounded-md border border-border/35 bg-background/20">
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 grid grid-cols-7"
                          >
                            {CALENDAR_GUIDE_COLUMNS.map((_, idx) => (
                              <div
                                key={`${weekIdx}-guide-${idx}`}
                                className={cn(
                                  "border-l border-border/20",
                                  idx === 6 && "border-r border-border/20",
                                  idx % 2 === 1 && "bg-muted/[0.12]"
                                )}
                              />
                            ))}
                          </div>

                          <div className="relative z-10 space-y-2 p-2">
                            {gridRow ? (
                              weekAssignments.length === 0 ? (
                                <p className="pt-1 text-xs italic text-muted-foreground/70">
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
                                          <p className="text-xs font-semibold text-foreground">
                                            {cell.physicianInitials ?? "—"}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })
                              )
                            ) : (
                              <p className="pt-1 text-xs italic text-muted-foreground/50">
                                No assignments
                              </p>
                            )}

                            {weekEvents.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {weekEvents.map((e, i) => (
                                  <span
                                    key={`${toISODate(days[0])}-${i}-${e.name}`}
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                      eventCategoryBadgeTone(e.category)
                                    )}
                                  >
                                    {e.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

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
          })} - ${endD.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

          return (
            <button
              key={row.weekNumber}
              className={cn(
                "w-full text-left rounded-xl border p-3 transition-colors hover:bg-accent/50",
                isCurrentWeek && "border-primary/40 bg-primary/5"
              )}
              onClick={() => onWeekClick?.(row.weekNumber)}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-semibold", isCurrentWeek && "text-primary")}>
                  {dateLabel}
                </span>
                {isCurrentWeek && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    This week
                  </span>
                )}
              </div>
              {myAssignment && (
                <div className="mt-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                  <p className="text-xs font-semibold text-foreground">
                    {rotationMap.get(String(myAssignment.rotationId))?.rotation.name ?? "Unknown"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {myAssignment.physicianName ?? "Unassigned physician"} ({myAssignment.physicianInitials ?? "—"})
                  </p>
                </div>
              )}
              {!physicianId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.cells.filter((c) => c.physicianId).length} assignments
                </p>
              )}
              {weekEvents.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {weekEvents.map((e, i) => (
                    <span
                      key={`${row.weekNumber}-${i}-${e.name}`}
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        eventCategoryBadgeTone(e.category)
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

function enumerateWeekDays(startDate: string): string[] {
  const days: string[] = []
  const cursor = toLocalDate(startDate)
  for (let i = 0; i < 7; i++) {
    days.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function eventCategoryBadgeTone(category: EventCategory): string {
  if (category === "federal_holiday") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
  }
  if (category === "conference") {
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
}
