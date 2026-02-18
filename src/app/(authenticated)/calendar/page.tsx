"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { Calendar as CalendarIcon } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FySelector } from "@/components/calendar/fy-selector"
import { CalendarLegend } from "@/components/calendar/calendar-legend"
import { CalendarFilters } from "@/components/calendar/calendar-filters"
import { IcsExportButton } from "@/components/calendar/ics-export-button"
import { YearMonthStack } from "@/components/calendar/year-month-stack"
import { MonthDetail } from "@/components/calendar/month-detail"
import { scrollToMonth } from "@/components/calendar/calendar-grid-utils"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type ViewMode = "year" | "month"
type ScopeMode = "my" | "department"

export default function CalendarPage() {
  const { physicianId, isAdmin } = useUserRole()
  const { fiscalYear: currentFy, isLoading: fyLoading } = useFiscalYear()

  const [selectedFyId, setSelectedFyId] = useState<Id<"fiscalYears"> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("year")
  const [scopeMode, setScopeMode] = useState<ScopeMode>("my")
  const [activeMonth, setActiveMonth] = useState<number>(new Date().getMonth())

  // Filters
  const [selectedRotationId, setSelectedRotationId] = useState<string | null>(null)
  const [selectedPhysicianId, setSelectedPhysicianId] = useState<string | null>(null)

  // Default to current FY when it loads
  useEffect(() => {
    if (currentFy && !selectedFyId) {
      setSelectedFyId(currentFy._id)
    }
  }, [currentFy, selectedFyId])

  // Reset physician filter when switching scope
  useEffect(() => {
    if (scopeMode === "my") setSelectedPhysicianId(null)
  }, [scopeMode])

  const calendarData = useQuery(
    api.functions.masterCalendar.getPublishedCalendarByFiscalYear,
    selectedFyId ? { fiscalYearId: selectedFyId } : "skip"
  )

  // ── Derived filter data ──────────────────────────────────────────────────

  const physicianOptions = useMemo(() => {
    if (!calendarData?.grid) return []
    const map = new Map<string, string>()
    for (const row of calendarData.grid)
      for (const cell of row.cells)
        if (cell.physicianId && cell.physicianName)
          map.set(String(cell.physicianId), cell.physicianName)
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [calendarData])

  const fiscalMonths = useMemo(() => {
    if (!calendarData?.grid) return []
    const seen = new Set<string>()
    const months: Array<{ month: number; year: number; label: string }> = []
    for (const row of calendarData.grid) {
      const d = new Date(row.startDate + "T00:00:00")
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!seen.has(key)) {
        seen.add(key)
        months.push({
          month: d.getMonth(),
          year: d.getFullYear(),
          label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        })
      }
    }
    return months
  }, [calendarData])

  // Effective physician ID for highlighting (My scope always uses signed-in physician)
  const filteredPhysicianId = useMemo((): Id<"physicians"> | null => {
    if (scopeMode === "my") return physicianId ?? null
    return (selectedPhysicianId as Id<"physicians">) ?? null
  }, [scopeMode, physicianId, selectedPhysicianId])

  // For ICS export: which physician to export
  const exportPhysicianId = useMemo((): Id<"physicians"> | null => {
    if (scopeMode === "my") return physicianId ?? null
    return (selectedPhysicianId as Id<"physicians">) ?? null
  }, [scopeMode, physicianId, selectedPhysicianId])

  const exportPhysicianInitials = useMemo((): string | null => {
    if (scopeMode === "my") {
      if (!calendarData?.grid || !physicianId) return null
      for (const row of calendarData.grid)
        for (const cell of row.cells)
          if (String(cell.physicianId) === String(physicianId))
            return cell.physicianInitials
      return null
    }
    if (!selectedPhysicianId) return null
    const opt = physicianOptions.find((p) => p.id === selectedPhysicianId)
    if (!opt) return null
    return opt.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
  }, [scopeMode, physicianId, selectedPhysicianId, physicianOptions, calendarData])

  // Rotation visibility set
  const visibleRotationIds = useMemo((): Set<string> | null => {
    if (!selectedRotationId) return null
    return new Set([selectedRotationId])
  }, [selectedRotationId])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleWeekClick = (weekNumber: number) => {
    if (!calendarData?.grid.length) return
    const week = calendarData.grid.find((w) => w.weekNumber === weekNumber)
    if (week) {
      setActiveMonth(new Date(week.startDate + "T00:00:00").getMonth())
      setViewMode("month")
    }
  }

  const handleMonthSelect = (month: number) => {
    setActiveMonth(month)
    if (viewMode === "year") {
      // In year (stack) view — scroll to the month anchor
      const entry = fiscalMonths.find((m) => m.month === month)
      if (entry) {
        scrollToMonth(entry.year, entry.month)
      }
    } else {
      setViewMode("month")
    }
  }

  const handleClearMonth = () => {
    setViewMode("year")
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (fyLoading || calendarData === undefined) {
    return (
      <>
        <PageHeader title="Calendar" description="Your fiscal year schedule at a glance" />
        <PageSkeleton />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description={calendarData?.fiscalYear?.label ?? "Select a fiscal year"}
        actions={
          <FySelector value={selectedFyId} onValueChange={setSelectedFyId} />
        }
      />
      <div className="flex-1 space-y-4 p-4 md:p-6">
        {/* Primary controls row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Tabs value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
              <TabsList>
                <TabsTrigger value="my">My Calendar</TabsTrigger>
                <TabsTrigger value="department">Department</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="year">Year</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarLegend
              rotations={(calendarData?.rotations ?? []).filter(
                (r) => !visibleRotationIds || visibleRotationIds.has(String(r._id))
              )}
            />
            {calendarData && (
              <IcsExportButton
                calendarData={calendarData}
                forPhysicianId={exportPhysicianId}
                forPhysicianInitials={exportPhysicianInitials}
              />
            )}
          </div>
        </div>

        {/* Filter controls row */}
        {calendarData && (
          <CalendarFilters
            rotations={calendarData.rotations}
            physicianOptions={physicianOptions}
            fiscalMonths={fiscalMonths}
            scopeMode={scopeMode}
            selectedRotationId={selectedRotationId}
            selectedPhysicianId={selectedPhysicianId}
            activeMonth={viewMode === "month" ? activeMonth : null}
            viewMode={viewMode}
            onRotationChange={setSelectedRotationId}
            onPhysicianChange={setSelectedPhysicianId}
            onMonthSelect={handleMonthSelect}
            onClearMonth={handleClearMonth}
          />
        )}

        {/* Calendar view */}
        {!calendarData?.grid.length ? (
          <EmptyState
            icon={CalendarIcon}
            title="No published calendar"
            description="The calendar for this fiscal year has not been published yet. Check back after the admin builds and publishes the schedule."
          />
        ) : viewMode === "year" ? (
          <YearMonthStack
            grid={calendarData.grid}
            rotations={calendarData.rotations}
            events={calendarData.events}
            physicianId={filteredPhysicianId}
            visibleRotationIds={visibleRotationIds}
            onWeekClick={handleWeekClick}
          />
        ) : (
          <MonthDetail
            grid={calendarData.grid}
            rotations={calendarData.rotations}
            events={calendarData.events}
            physicianId={filteredPhysicianId}
            visibleRotationIds={visibleRotationIds}
            activeMonth={activeMonth}
            onMonthChange={setActiveMonth}
            onBackToYear={() => setViewMode("year")}
          />
        )}
      </div>
    </>
  )
}
