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
import { DepartmentWeekMatrix } from "@/components/calendar/department-week-matrix"
import { monthAnchorId, deriveFiscalMonths } from "@/components/calendar/calendar-grid-utils"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type ViewMode = "year" | "month"
type ScopeMode = "my" | "department"
type CalendarMonthRef = { month: number; year: number }

export default function CalendarPage() {
  const { physicianId, isAdmin } = useUserRole()
  const { fiscalYear: currentFy, isLoading: fyLoading } = useFiscalYear()

  const [selectedFyId, setSelectedFyId] = useState<Id<"fiscalYears"> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("year")
  const [scopeMode, setScopeMode] = useState<ScopeMode>("my")
  const [activePeriod, setActivePeriod] = useState<CalendarMonthRef | null>(null)
  const [pendingScroll, setPendingScroll] = useState<{ year: number; month: number } | null>(null)

  // Filters
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [selectedPhysicianId, setSelectedPhysicianId] = useState<string | null>(null)
  const [hasAppliedProfileDefaults, setHasAppliedProfileDefaults] = useState(false)

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

  useEffect(() => {
    if (!pendingScroll) return
    if (viewMode !== "year") {
      setPendingScroll(null)
      return
    }

    const { year, month } = pendingScroll
    requestAnimationFrame(() => {
      document.getElementById(monthAnchorId(year, month))?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      setPendingScroll(null)
    })
  }, [pendingScroll, viewMode])

  const calendarData = useQuery(
    api.functions.masterCalendar.getPublishedCalendarByFiscalYear,
    selectedFyId ? { fiscalYearId: selectedFyId } : "skip"
  )
  const profileSettings = useQuery(api.functions.userSettings.getMyUserSettings)

  useEffect(() => {
    if (hasAppliedProfileDefaults || profileSettings === undefined) return
    setScopeMode(profileSettings.calendarPrefs.defaultExportScope)
    setHasAppliedProfileDefaults(true)
  }, [hasAppliedProfileDefaults, profileSettings])

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

  const fiscalMonths = useMemo(
    () => (calendarData?.grid ? deriveFiscalMonths(calendarData.grid) : []),
    [calendarData],
  )

  useEffect(() => {
    if (fiscalMonths.length === 0) {
      if (activePeriod !== null) setActivePeriod(null)
      return
    }

    const hasActivePeriod =
      !!activePeriod &&
      fiscalMonths.some(
        (entry) => entry.month === activePeriod.month && entry.year === activePeriod.year
      )
    if (hasActivePeriod) return

    const today = new Date()
    const currentEntry =
      fiscalMonths.find(
        (entry) => entry.month === today.getMonth() && entry.year === today.getFullYear()
      ) ?? fiscalMonths[0]

    setActivePeriod({ month: currentEntry.month, year: currentEntry.year })
  }, [fiscalMonths, activePeriod])

  // Effective physician ID for highlighting (My scope always uses signed-in physician)
  const filteredPhysicianId = useMemo((): Id<"physicians"> | null => {
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
    if (selectedServiceIds.length === 0) return null
    return new Set(selectedServiceIds)
  }, [selectedServiceIds])

  const handleServiceToggle = (ids: string[]) => {
    setSelectedServiceIds((prev) =>
      ids.every((id) => prev.includes(id))
        ? prev.filter((serviceId) => !ids.includes(serviceId))
        : [...new Set([...prev, ...ids])]
    )
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleWeekClick = (weekNumber: number) => {
    if (!calendarData?.grid.length) return
    const week = calendarData.grid.find((w) => w.weekNumber === weekNumber)
    if (week) {
      const startDate = new Date(`${week.startDate}T00:00:00`)
      setActivePeriod({
        month: startDate.getMonth(),
        year: startDate.getFullYear(),
      })
      setViewMode("month")
    }
  }

  const handleMonthSelect = (month: number, year: number) => {
    setActivePeriod({ month, year })
    if (viewMode === "year") {
      setPendingScroll({ year, month })
    } else {
      setViewMode("month")
    }
  }

  const handleClearMonth = () => {
    setViewMode("year")
  }

  const monthViewPeriod =
    activePeriod ??
    (fiscalMonths[0]
      ? { month: fiscalMonths[0].month, year: fiscalMonths[0].year }
      : { month: new Date().getMonth(), year: new Date().getFullYear() })

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
                forPhysicianId={filteredPhysicianId}
                forPhysicianInitials={exportPhysicianInitials}
                includeCalendarEvents={profileSettings?.calendarPrefs.includeCalendarEvents ?? true}
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
            selectedServiceIds={selectedServiceIds}
            selectedPhysicianId={selectedPhysicianId}
            activePeriod={viewMode === "month" ? monthViewPeriod : null}
            viewMode={viewMode}
            onServiceToggle={handleServiceToggle}
            onClearServices={() => setSelectedServiceIds([])}
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
        ) : scopeMode === "department" && isAdmin ? (
          <DepartmentWeekMatrix
            grid={calendarData.grid}
            rotations={calendarData.rotations}
            events={calendarData.events}
            visibleRotationIds={visibleRotationIds}
            selectedPhysicianId={filteredPhysicianId}
            activePeriod={viewMode === "month" ? monthViewPeriod : null}
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
            activePeriod={monthViewPeriod}
            onMonthChange={(month, year) => setActivePeriod({ month, year })}
            onBackToYear={() => setViewMode("year")}
          />
        )}
      </div>
    </>
  )
}
