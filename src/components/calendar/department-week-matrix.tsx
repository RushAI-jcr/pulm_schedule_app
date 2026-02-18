"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { getRotationAccent } from "./calendar-tokens"
import { toLocalDate, type EventCategory, type GridRow } from "./calendar-grid-utils"
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

export function DepartmentWeekMatrix({
  grid,
  rotations,
  events,
  visibleRotationIds,
  selectedPhysicianId,
  activePeriod,
}: {
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
  visibleRotationIds?: Set<string> | null
  selectedPhysicianId?: Id<"physicians"> | null
  activePeriod: { month: number; year: number } | null
}) {
  const visibleRotations = useMemo(
    () =>
      rotations.filter(
        (rotation) =>
          !visibleRotationIds || visibleRotationIds.has(String(rotation._id)),
      ),
    [rotations, visibleRotationIds],
  )

  const rows = useMemo(() => {
    const monthStart = activePeriod
      ? new Date(activePeriod.year, activePeriod.month, 1)
      : null
    const monthEnd = activePeriod
      ? new Date(activePeriod.year, activePeriod.month + 1, 0)
      : null

    const baseRows = grid.filter((row) => {
      if (!monthStart || !monthEnd) return true
      const weekStart = toLocalDate(row.startDate)
      const weekEnd = toLocalDate(row.endDate)
      return weekStart <= monthEnd && weekEnd >= monthStart
    })
    return baseRows
  }, [grid, activePeriod])

  const eventsByWeekId = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = String(event.weekId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [events])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No week blocks found for this period.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground tracking-wide">
                Week
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground tracking-wide">
                Dates
              </th>
              {visibleRotations.map((rotation) => (
                <th
                  key={String(rotation._id)}
                  className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground tracking-wide"
                >
                  <span className="font-semibold text-foreground">
                    {rotation.abbreviation}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const start = toLocalDate(row.startDate)
              const end = toLocalDate(row.endDate)
              const dateLabel = `${start.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })} - ${end.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}`

              const weekCellsByRotation = new Map<string, GridRow["cells"][number]>()
              for (const cell of row.cells) {
                weekCellsByRotation.set(String(cell.rotationId), cell)
              }

              return (
                <tr key={row.weekId} className="border-b last:border-0 align-top">
                  <td className="px-3 py-3 text-sm font-medium text-foreground">
                    W{row.weekNumber}
                  </td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">
                    <div>{dateLabel}</div>
                    {(eventsByWeekId.get(String(row.weekId)) ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(eventsByWeekId.get(String(row.weekId)) ?? []).map((event, idx) => (
                          <span
                            key={`${event.weekId}-${event.date}-${idx}`}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              event.category === "federal_holiday"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                                : event.category === "conference"
                                  ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                            )}
                          >
                            {event.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {visibleRotations.map((rotation, rotIdx) => {
                    const cell = weekCellsByRotation.get(String(rotation._id))
                    const accent = getRotationAccent(rotIdx)
                    const isSelected =
                      !!selectedPhysicianId &&
                      !!cell?.physicianId &&
                      String(cell.physicianId) === String(selectedPhysicianId)
                    const dimmed =
                      !!selectedPhysicianId &&
                      !!cell?.physicianId &&
                      !isSelected

                    return (
                      <td key={`${row.weekId}-${rotation._id}`} className="px-2 py-2">
                        <div
                          className={cn(
                            "rounded-md border px-2 py-1.5 min-h-[48px] border-l-[3px]",
                            accent.borderL,
                            accent.subtleBg,
                            dimmed && "opacity-35",
                          )}
                        >
                          <div className="text-sm font-semibold text-foreground">
                            {cell?.physicianInitials ?? "-"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {cell?.physicianName ?? "Unassigned"}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
