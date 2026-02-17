"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

export function PriorYearHolidaySummary() {
  const summary = useQuery(api.functions.masterCalendar.getPriorYearHolidaySummary)

  if (summary === undefined) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Prior Year Holiday Assignments</Label>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!summary.available) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Prior Year Holiday Assignments</Label>
        <p className="text-xs text-muted-foreground">{summary.reason}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        Prior Year ({summary.priorFiscalYearLabel})
      </Label>
      {summary.holidays.map((holiday) => (
        <div key={holiday.holidayName} className="space-y-1">
          <p className="text-xs font-medium">{holiday.holidayName}</p>
          <div className="flex flex-wrap gap-1">
            {holiday.physicians.length === 0 ? (
              <span className="text-xs text-muted-foreground">No assignments</span>
            ) : (
              holiday.physicians.map((p) => (
                <Badge key={String(p.physicianId)} variant="outline" className="text-[10px]">
                  {p.initials} ({p.lastName})
                </Badge>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
