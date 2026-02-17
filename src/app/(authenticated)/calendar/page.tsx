"use client"

import { useState, useEffect } from "react"
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
import { YearOverview } from "@/components/calendar/year-overview"
import { MonthDetail } from "@/components/calendar/month-detail"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type ViewMode = "year" | "month"
type ScopeMode = "my" | "department"

export default function CalendarPage() {
  const { physicianId } = useUserRole()
  const { fiscalYear: currentFy, isLoading: fyLoading } = useFiscalYear()
  const [selectedFyId, setSelectedFyId] = useState<Id<"fiscalYears"> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("year")
  const [scopeMode, setScopeMode] = useState<ScopeMode>("my")
  const [activeMonth, setActiveMonth] = useState<number>(new Date().getMonth())

  // Default to current FY when it loads
  useEffect(() => {
    if (currentFy && !selectedFyId) {
      setSelectedFyId(currentFy._id)
    }
  }, [currentFy, selectedFyId])

  const calendarData = useQuery(
    api.functions.masterCalendar.getPublishedCalendarByFiscalYear,
    selectedFyId ? { fiscalYearId: selectedFyId } : "skip"
  )

  if (fyLoading || calendarData === undefined) {
    return (
      <>
        <PageHeader title="Calendar" description="Your fiscal year schedule at a glance" />
        <PageSkeleton />
      </>
    )
  }

  const effectivePhysicianId = scopeMode === "my" ? physicianId : null

  const handleWeekClick = (weekNumber: number) => {
    if (!calendarData?.grid.length) return
    const week = calendarData.grid.find((w) => w.weekNumber === weekNumber)
    if (week) {
      const month = new Date(week.startDate + "T00:00:00").getMonth()
      setActiveMonth(month)
      setViewMode("month")
    }
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
        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Tabs
              value={scopeMode}
              onValueChange={(v) => setScopeMode(v as ScopeMode)}
            >
              <TabsList>
                <TabsTrigger value="my">My Calendar</TabsTrigger>
                <TabsTrigger value="department">Department</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
            >
              <TabsList>
                <TabsTrigger value="year">Year</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <CalendarLegend rotations={calendarData?.rotations ?? []} />
        </div>

        {/* Calendar view */}
        {!calendarData?.grid.length ? (
          <EmptyState
            icon={CalendarIcon}
            title="No published calendar"
            description="The calendar for this fiscal year has not been published yet. Check back after the admin builds and publishes the schedule."
          />
        ) : viewMode === "year" ? (
          <YearOverview
            grid={calendarData.grid}
            rotations={calendarData.rotations}
            events={calendarData.events}
            physicianId={effectivePhysicianId}
            onWeekClick={handleWeekClick}
          />
        ) : (
          <MonthDetail
            grid={calendarData.grid}
            rotations={calendarData.rotations}
            events={calendarData.events}
            physicianId={effectivePhysicianId}
            activeMonth={activeMonth}
            onMonthChange={setActiveMonth}
            onBackToYear={() => setViewMode("year")}
          />
        )}
      </div>
    </>
  )
}
