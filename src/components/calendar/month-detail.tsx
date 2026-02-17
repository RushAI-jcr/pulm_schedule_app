"use client"

import { useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { getRotationColor } from "./calendar-legend"
import type { Id } from "../../../convex/_generated/dataModel"

type GridRow = {
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

function getMonthYear(dateStr: string): { month: number; year: number; label: string } {
  const d = new Date(dateStr + "T00:00:00")
  return {
    month: d.getMonth(),
    year: d.getFullYear(),
    label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  }
}

export function MonthDetail({
  grid,
  rotations,
  events,
  physicianId,
  activeMonth,
  onMonthChange,
  onBackToYear,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  physicianId: Id<"physicians"> | null
  activeMonth: number // 0-11
  onMonthChange: (month: number) => void
  onBackToYear: () => void
}) {
  // Filter weeks whose start date falls in the active month
  const { monthWeeks, monthLabel, monthEvents } = useMemo(() => {
    const filtered = grid.filter((row) => {
      const { month } = getMonthYear(row.startDate)
      return month === activeMonth
    })

    const label = filtered.length > 0
      ? getMonthYear(filtered[0].startDate).label
      : new Date(2026, activeMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })

    const weekIds = new Set(filtered.map((w) => String(w.weekId)))
    const filteredEvents = events.filter((e) => weekIds.has(String(e.weekId)))

    return { monthWeeks: filtered, monthLabel: label, monthEvents: filteredEvents }
  }, [grid, events, activeMonth])

  const eventsByWeek = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of monthEvents) {
      const key = String(event.weekId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [monthEvents])

  const prevMonth = activeMonth === 0 ? 11 : activeMonth - 1
  const nextMonth = activeMonth === 11 ? 0 : activeMonth + 1

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBackToYear}>
          Year View
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(prevMonth)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold min-w-[180px] text-center">{monthLabel}</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(nextMonth)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-[72px]" /> {/* spacer for centering */}
      </div>

      {monthWeeks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No weeks in this month.
        </p>
      ) : (
        <div className="space-y-3">
          {monthWeeks.map((row) => {
            const weekEvents = eventsByWeek.get(String(row.weekId)) ?? []

            return (
              <div key={row.weekNumber} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">Week {row.weekNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.startDate} – {row.endDate}
                  </span>
                </div>

                {/* Events for this week */}
                {weekEvents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {weekEvents.map((e, i) => (
                      <span
                        key={i}
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-md",
                          e.category === "federal_holiday"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                            : e.category === "conference"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        )}
                      >
                        {e.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Rotation assignments */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {row.cells.map((cell) => {
                    const rotation = rotations.find(
                      (r) => String(r._id) === String(cell.rotationId)
                    )
                    if (!rotation) return null
                    const rotIdx = rotations.indexOf(rotation)
                    const isMe = physicianId && String(cell.physicianId) === String(physicianId)
                    const dimmed = physicianId && !isMe

                    return (
                      <div
                        key={String(cell.rotationId)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                          getRotationColor(rotIdx),
                          dimmed && "opacity-30"
                        )}
                      >
                        <span className="font-bold">{rotation.abbreviation}</span>
                        <span className="truncate">
                          {cell.physicianName ?? "Unassigned"}
                        </span>
                        {isMe && (
                          <span className="ml-auto text-[10px] font-semibold uppercase">You</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
