"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import {
  buildMasterCalendarIcs,
  type MasterCalendarExportData,
  type MasterCalendarExportAssignment,
  type MasterCalendarExportEvent,
} from "@/shared/services/masterCalendarExport"
import type { Id } from "../../../convex/_generated/dataModel"
import type { GridRow } from "./calendar-grid-utils"

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

type CalendarData = {
  fiscalYear: { label: string } | null
  grid: GridRow[]
  rotations: Rotation[]
  events: CalendarEvent[]
}

interface IcsExportButtonProps {
  calendarData: CalendarData
  /** null = export all physicians (department) */
  forPhysicianId: Id<"physicians"> | null
  forPhysicianInitials: string | null
}

function buildExportData(
  calendarData: CalendarData,
  forPhysicianId: Id<"physicians"> | null,
): MasterCalendarExportData {
  const rotationMap = new Map(
    calendarData.rotations.map((r) => [String(r._id), r])
  )

  const assignments: MasterCalendarExportAssignment[] = []
  const physicianMap = new Map<string, { id: string; fullName: string; initials: string }>()

  for (const row of calendarData.grid) {
    for (const cell of row.cells) {
      if (!cell.physicianId || !cell.physicianName || !cell.physicianInitials) continue
      if (forPhysicianId && String(cell.physicianId) !== String(forPhysicianId)) continue

      const rotation = rotationMap.get(String(cell.rotationId))
      if (!rotation) continue

      const pid = String(cell.physicianId)
      if (!physicianMap.has(pid)) {
        physicianMap.set(pid, {
          id: pid,
          fullName: cell.physicianName,
          initials: cell.physicianInitials,
        })
      }

      assignments.push({
        physicianId: pid,
        physicianName: cell.physicianName,
        physicianInitials: cell.physicianInitials,
        weekId: String(row.weekId),
        weekNumber: row.weekNumber,
        weekStartDate: row.startDate,
        weekEndDate: row.endDate,
        rotationId: String(cell.rotationId),
        rotationName: rotation.name,
        rotationAbbreviation: rotation.abbreviation,
      })
    }
  }

  const calendarEvents: MasterCalendarExportEvent[] = calendarData.events.map((e, i) => ({
    id: `event-${String(e.weekId)}-${e.date}-${i}`,
    weekId: String(e.weekId),
    date: e.date,
    name: e.name,
    category: e.category,
  }))

  return {
    fiscalYearLabel: calendarData.fiscalYear?.label ?? "FY",
    generatedAtMs: Date.now(),
    physicians: [...physicianMap.values()],
    weeks: calendarData.grid.map((row) => ({
      id: String(row.weekId),
      weekNumber: row.weekNumber,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    rotations: calendarData.rotations.map((r) => ({
      id: String(r._id),
      name: r.name,
      abbreviation: r.abbreviation,
    })),
    assignments,
    calendarEvents,
  }
}

function downloadIcs(icsString: string, filename: string) {
  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 60s is generous but correct: object URLs are in-process memory, not network
  // resources. Revoking too early (e.g. 1s) breaks the download on slow devices.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function IcsExportButton({
  calendarData,
  forPhysicianId,
  forPhysicianInitials,
}: IcsExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const fyLabel = calendarData.fiscalYear?.label ?? "schedule"
  const suffix = forPhysicianInitials
    ? forPhysicianInitials.toLowerCase()
    : "department"
  const filename = `${fyLabel.replace(/\s+/g, "-")}-${suffix}-schedule.ics`

  const handleExport = () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const exportData = buildExportData(calendarData, forPhysicianId)
      if (exportData.assignments.length === 0) return
      const icsString = buildMasterCalendarIcs(exportData)
      downloadIcs(icsString, filename)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={handleExport}
      disabled={isExporting}
      title={`Export schedule as .ics (${forPhysicianInitials ?? "full department"})`}
    >
      <Download className="h-3.5 w-3.5" />
      Export .ics
    </Button>
  )
}
