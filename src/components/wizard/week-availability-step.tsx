"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Button } from "@/shared/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { AvailabilityIndicator } from "@/components/shared/availability-indicator"
import { WeekImportPanel, type WeekImportMode, type WeekImportTarget } from "@/components/wizard/week-import-panel"
import { Check, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react"

type Availability = "green" | "yellow" | "red"
type ReasonCategory = "vacation" | "conference" | "personal_religious" | "admin_leave" | "other"

type WeekRow = {
  weekId: Id<"weeks">
  weekNumber: number
  startDate: string
  endDate: string
  availability: Availability | null
  reasonCategory?: ReasonCategory
  reasonText?: string
  events: Array<{ name: string; category: string }>
}

export function WeekAvailabilityStep({
  weeks,
  weekPreferences,
  calendarEvents,
  importMode,
  importTargets = [],
  defaultImportTargetId,
  fiscalYearLabel,
  readOnly = false,
  onSaveStatusChange,
}: {
  weeks: Array<{
    _id: Id<"weeks">
    weekNumber: number
    startDate: string
    endDate: string
  }>
  weekPreferences: Array<{
    weekId: Id<"weeks">
    availability: Availability
    reasonCategory?: ReasonCategory
    reasonText?: string
  }>
  calendarEvents: Array<{
    weekId: Id<"weeks">
    name: string
    category: string
  }>
  importMode?: WeekImportMode
  importTargets?: WeekImportTarget[]
  defaultImportTargetId?: Id<"physicians"> | null
  fiscalYearLabel?: string | null
  readOnly?: boolean
  onSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void
}) {
  const setWeekPref = useMutation(api.functions.scheduleRequests.setMyWeekPreference)
  const batchSetPrefs = useMutation(api.functions.scheduleRequests.batchSetWeekPreferences)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null)
  const [localPrefs, setLocalPrefs] = useState<Map<string, {
    availability: Availability
    reasonCategory?: ReasonCategory
    reasonText?: string
  }>>(() => {
    const map = new Map()
    for (const pref of weekPreferences) {
      map.set(String(pref.weekId), {
        availability: pref.availability,
        reasonCategory: pref.reasonCategory,
        reasonText: pref.reasonText,
      })
    }
    return map
  })

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const map = new Map<string, {
      availability: Availability
      reasonCategory?: ReasonCategory
      reasonText?: string
    }>()
    for (const pref of weekPreferences) {
      map.set(String(pref.weekId), {
        availability: pref.availability,
        reasonCategory: pref.reasonCategory,
        reasonText: pref.reasonText,
      })
    }
    setLocalPrefs(map)
  }, [weekPreferences])

  const eventsByWeek = useMemo(() => {
    const map = new Map<string, Array<{ name: string; category: string }>>()
    for (const e of calendarEvents) {
      const key = String(e.weekId)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [calendarEvents])

  const rows: WeekRow[] = useMemo(() => {
    return weeks.map((w) => {
      const pref = localPrefs.get(String(w._id))
      return {
        weekId: w._id,
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        endDate: w.endDate,
        availability: pref?.availability ?? null,
        reasonCategory: pref?.reasonCategory,
        reasonText: pref?.reasonText,
        events: eventsByWeek.get(String(w._id)) ?? [],
      }
    })
  }, [weeks, localPrefs, eventsByWeek])

  const counts = useMemo(() => {
    let green = 0, yellow = 0, red = 0, unset = 0
    for (const row of rows) {
      if (row.availability === "green") green++
      else if (row.availability === "yellow") yellow++
      else if (row.availability === "red") red++
      else unset++
    }
    return { green, yellow, red, unset }
  }, [rows])

  const handleAvailabilityChange = useCallback(
    async (weekId: Id<"weeks">, availability: Availability) => {
      if (readOnly) return

      setLocalPrefs((prev) => {
        const next = new Map(prev)
        const existing = next.get(String(weekId))
        next.set(String(weekId), {
          ...existing,
          availability,
          // Clear reason if marking as green
          reasonCategory: availability === "green" ? undefined : existing?.reasonCategory,
          reasonText: availability === "green" ? undefined : existing?.reasonText,
        })
        return next
      })

      onSaveStatusChange?.("saving")
      try {
        await setWeekPref({ weekId, availability })
        onSaveStatusChange?.("saved")
      } catch {
        onSaveStatusChange?.("error")
      }
    },
    [readOnly, setWeekPref, onSaveStatusChange],
  )

  const handleReasonChange = useCallback(
    (weekId: Id<"weeks">, field: "reasonCategory" | "reasonText", value: string | undefined) => {
      if (readOnly) return

      setLocalPrefs((prev) => {
        const next = new Map(prev)
        const existing = next.get(String(weekId))
        if (!existing) return prev
        next.set(String(weekId), { ...existing, [field]: value })
        return next
      })

      // Debounce saving reason fields
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(async () => {
        const pref = localPrefs.get(String(weekId))
        if (!pref) return
        onSaveStatusChange?.("saving")
        try {
          await setWeekPref({
            weekId,
            availability: pref.availability,
            reasonCategory: field === "reasonCategory" ? (value as ReasonCategory) : pref.reasonCategory,
            reasonText: field === "reasonText" ? value : pref.reasonText,
          })
          onSaveStatusChange?.("saved")
        } catch {
          onSaveStatusChange?.("error")
        }
      }, 500)
    },
    [readOnly, localPrefs, setWeekPref, onSaveStatusChange],
  )

  const handleMarkAllAvailable = useCallback(async () => {
    if (readOnly) return
    onSaveStatusChange?.("saving")

    const prefs = weeks.map((w) => ({
      weekId: w._id,
      availability: "green" as const,
    }))

    setLocalPrefs((prev) => {
      const next = new Map(prev)
      for (const p of prefs) {
        next.set(String(p.weekId), { availability: "green" })
      }
      return next
    })

    try {
      await batchSetPrefs({ preferences: prefs })
      onSaveStatusChange?.("saved")
    } catch {
      onSaveStatusChange?.("error")
    }
  }, [readOnly, weeks, batchSetPrefs, onSaveStatusChange])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div className="space-y-4">
      {importMode && importTargets.length > 0 && (
        <WeekImportPanel
          mode={importMode}
          readOnly={readOnly}
          fiscalYearLabel={fiscalYearLabel}
          fiscalWeeks={weeks.map((week) => ({ _id: week._id, startDate: week.startDate }))}
          targets={importTargets}
          defaultTargetId={defaultImportTargetId}
          onSaveStatusChange={onSaveStatusChange}
        />
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">Progress:</span>
        <div className="flex items-center gap-1.5">
          <AvailabilityIndicator level="green" />
          <span className="text-xs">{counts.green}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AvailabilityIndicator level="yellow" />
          <span className="text-xs">{counts.yellow}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AvailabilityIndicator level="red" />
          <span className="text-xs">{counts.red}</span>
        </div>
        {counts.unset > 0 && (
          <span className="text-xs text-muted-foreground">
            {counts.unset} unset
          </span>
        )}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={handleMarkAllAvailable}
          >
            Mark All Available
          </Button>
        )}
      </div>

      {/* Week list */}
      <div className="space-y-1">
        {rows.map((row) => {
          const isExpanded = expandedWeek === String(row.weekId)
          const showReasonFields = row.availability === "yellow" || row.availability === "red"

          return (
            <div
              key={String(row.weekId)}
              className={cn(
                "rounded-lg border transition-colors",
                row.availability === "red" && "border-rose-200 dark:border-rose-900/50",
                row.availability === "yellow" && "border-amber-200 dark:border-amber-900/50",
              )}
            >
              {/* Main row */}
              <div className="flex items-center gap-2 p-3">
                <span className="text-sm font-semibold w-12 shrink-0">
                  W{row.weekNumber}
                </span>
                <span className="text-xs text-muted-foreground min-w-[120px] shrink-0">
                  {formatDate(row.startDate)} – {formatDate(row.endDate)}
                </span>

                {/* Events */}
                {row.events.length > 0 && (
                  <div className="hidden sm:flex flex-wrap gap-1 flex-1 min-w-0">
                    {row.events.map((e, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          e.category === "federal_holiday" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
                          e.category === "conference" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                        )}
                      >
                        {e.name}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {/* Availability toggles */}
                  {(["green", "yellow", "red"] as const).map((level) => {
                    const icons = { green: Check, yellow: AlertTriangle, red: X }
                    const Icon = icons[level]
                    const isActive = row.availability === level

                    return (
                      <button
                        key={level}
                        onClick={() => handleAvailabilityChange(row.weekId, level)}
                        disabled={readOnly}
                        className={cn(
                          "rounded-md p-1.5 transition-colors",
                          isActive && level === "green" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                          isActive && level === "yellow" && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                          isActive && level === "red" && "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
                          !isActive && "text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent",
                          readOnly && "cursor-default hover:bg-transparent",
                        )}
                        title={level === "green" ? "Available" : level === "yellow" ? "Prefer Not" : "Unavailable"}
                        aria-label={`Mark week ${row.weekNumber} as ${level === "green" ? "available" : level === "yellow" ? "prefer not" : "unavailable"}`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    )
                  })}

                  {/* Expand button for reason fields */}
                  {showReasonFields && (
                    <button
                      onClick={() => setExpandedWeek(isExpanded ? null : String(row.weekId))}
                      className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                      aria-label={isExpanded ? "Collapse details" : "Expand details"}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile events */}
              {row.events.length > 0 && (
                <div className="sm:hidden flex flex-wrap gap-1 px-3 pb-2">
                  {row.events.map((e, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        e.category === "federal_holiday" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
                        e.category === "conference" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                      )}
                    >
                      {e.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Expanded reason fields */}
              {showReasonFields && isExpanded && (
                <div className="border-t px-3 py-3 flex flex-col sm:flex-row gap-3">
                  <div className="sm:w-48">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Reason
                    </label>
                    <Select
                      value={row.reasonCategory ?? ""}
                      onValueChange={(val) =>
                        handleReasonChange(row.weekId, "reasonCategory", val || undefined)
                      }
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vacation">Vacation / PTO</SelectItem>
                        <SelectItem value="conference">Conference</SelectItem>
                        <SelectItem value="personal_religious">Personal / Religious</SelectItem>
                        <SelectItem value="admin_leave">Admin Leave</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Details (optional)
                    </label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Add details..."
                      value={row.reasonText ?? ""}
                      onChange={(e) =>
                        handleReasonChange(row.weekId, "reasonText", e.target.value || undefined)
                      }
                      disabled={readOnly}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
