"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  Download,
  LayoutGrid,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/shared/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HolidayCoverageReport } from "@/components/reports/holiday-coverage-report"
import { RotationDistributionReport } from "@/components/reports/rotation-distribution-report"
import { CfteComplianceReport } from "@/components/reports/cfte-compliance-report"
import { TradeActivityReport } from "@/components/reports/trade-activity-report"
import { YoyTrendsReport } from "@/components/reports/yoy-trends-report"
import { cn } from "@/lib/utils"

type ReportTabId = "holiday" | "rotation" | "cfte" | "trade" | "yoy"

type ReportTabConfig = {
  id: ReportTabId
  label: string
  description: string
  scope: "single" | "multi"
  icon: LucideIcon
}

const reportTabs: ReportTabConfig[] = [
  {
    id: "holiday",
    label: "Holiday Coverage",
    description: "Fairness and holiday distribution",
    scope: "multi",
    icon: CalendarDays,
  },
  {
    id: "rotation",
    label: "Rotation Distribution",
    description: "Weeks assigned by rotation and physician",
    scope: "single",
    icon: LayoutGrid,
  },
  {
    id: "cfte",
    label: "cFTE Compliance",
    description: "Target variance and compliance rate",
    scope: "single",
    icon: Target,
  },
  {
    id: "trade",
    label: "Trade Activity",
    description: "Trade volume, approvals, and turnaround",
    scope: "single",
    icon: ArrowLeftRight,
  },
  {
    id: "yoy",
    label: "Year-over-Year",
    description: "Compare assignment trends across years",
    scope: "multi",
    icon: TrendingUp,
  },
]

function FiscalYearSelector({
  fiscalYears,
  selected,
  onToggle,
  multi,
  currentFiscalYearId,
}: {
  fiscalYears: Array<{ _id: Id<"fiscalYears">; label: string; status: string }>
  selected: Id<"fiscalYears">[]
  onToggle: (id: Id<"fiscalYears">) => void
  multi?: boolean
  currentFiscalYearId?: Id<"fiscalYears"> | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {multi ? "Select fiscal years:" : "Fiscal year:"}
      </span>
      {fiscalYears.map((fy) => {
        const isSelected = selected.includes(fy._id)
        return (
          <button
            key={String(fy._id)}
            onClick={() => onToggle(fy._id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent border-border",
            )}
          >
            {fy.label}
            {currentFiscalYearId === fy._id ? " (Current)" : ""}
          </button>
        )
      })}
    </div>
  )
}

function exportTableToCsv(tableSelector: string, filename: string) {
  const table = document.querySelector(tableSelector)
  if (!table) return

  const rows = table.querySelectorAll("tr")
  const csvRows: string[] = []
  rows.forEach((row) => {
    const cells = row.querySelectorAll("th, td")
    const csvRow = Array.from(cells)
      .map((cell) => {
        const text = cell.textContent?.trim() ?? ""
        return `"${text.replace(/"/g, '""')}"`
      })
      .join(",")
    csvRows.push(csvRow)
  })

  const csv = csvRows.join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const fiscalYears = useQuery(api.functions.reports.getAllFiscalYears)
  const currentFiscalYear = useQuery(api.functions.fiscalYears.getCurrentFiscalYear)
  const [activeTab, setActiveTab] = useState<ReportTabId>("holiday")

  // Single FY selection (for rotation, cfte, trade)
  const [singleFyId, setSingleFyId] = useState<Id<"fiscalYears"> | null>(null)
  // Multi FY selection (for holiday, yoy)
  const [multiFyIds, setMultiFyIds] = useState<Id<"fiscalYears">[]>([])

  const sortedFiscalYears = useMemo(() => {
    if (!fiscalYears) return []

    const currentId = currentFiscalYear?._id
    return [...fiscalYears].sort((a, b) => {
      if (currentId && a._id === currentId) return -1
      if (currentId && b._id === currentId) return 1
      return b.label.localeCompare(a.label)
    })
  }, [fiscalYears, currentFiscalYear?._id])

  useEffect(() => {
    if (!sortedFiscalYears || sortedFiscalYears.length === 0) return

    const currentId = currentFiscalYear?._id
    const preferredId = currentId && sortedFiscalYears.some((fy) => fy._id === currentId)
      ? currentId
      : sortedFiscalYears[0]._id

    setSingleFyId((current) => {
      if (current && sortedFiscalYears.some((fy) => fy._id === current)) return current
      return preferredId
    })

    setMultiFyIds((current) => {
      const validIds = current.filter((id) => sortedFiscalYears.some((fy) => fy._id === id))
      if (validIds.length > 0) return validIds
      return [preferredId]
    })
  }, [sortedFiscalYears, currentFiscalYear?._id])

  if (fiscalYears === undefined) {
    return (
      <>
        <PageHeader title="Reports" description="Scheduling analytics and compliance reports" />
        <PageSkeleton />
      </>
    )
  }

  if (sortedFiscalYears.length === 0) {
    return (
      <>
        <PageHeader title="Reports" description="Scheduling analytics and compliance reports" />
        <div className="flex-1 p-6">
          <EmptyState
            icon={BarChart3}
            title="No fiscal years"
            description="Create a fiscal year in Settings to generate reports."
          />
        </div>
      </>
    )
  }

  const handleSingleToggle = (id: Id<"fiscalYears">) => {
    setSingleFyId(id)
  }

  const handleMultiToggle = (id: Id<"fiscalYears">) => {
    setMultiFyIds((prev) =>
      prev.includes(id)
        ? (prev.length === 1 ? prev : prev.filter((fid) => fid !== id))
        : [...prev, id],
    )
  }

  const handleUseCurrentFiscalYear = () => {
    if (!currentFiscalYear?._id) return
    setSingleFyId(currentFiscalYear._id)
    setMultiFyIds([currentFiscalYear._id])
  }

  const handleUseCurrentAndPreviousFiscalYears = () => {
    if (sortedFiscalYears.length === 0) return

    if (!currentFiscalYear?._id) {
      setMultiFyIds(sortedFiscalYears.slice(0, 2).map((fy) => fy._id))
      return
    }

    const currentIndex = sortedFiscalYears.findIndex((fy) => fy._id === currentFiscalYear._id)
    const previous = sortedFiscalYears.find((fy, index) => index > currentIndex)
    const selection = previous
      ? [currentFiscalYear._id, previous._id]
      : sortedFiscalYears.slice(0, 2).map((fy) => fy._id)
    setMultiFyIds([...new Set(selection)])
  }

  const handleUseAllFiscalYears = () => {
    setMultiFyIds(sortedFiscalYears.map((fy) => fy._id))
  }

  const activeReport = reportTabs.find((report) => report.id === activeTab) ?? reportTabs[0]
  const isMultiTab = activeReport.scope === "multi"
  const isYoyTab = activeReport.id === "yoy"

  const fiscalYearLabelById = useMemo(
    () => new Map(sortedFiscalYears.map((fy) => [fy._id, fy.label])),
    [sortedFiscalYears],
  )

  const selectedLabels = (isMultiTab ? multiFyIds : singleFyId ? [singleFyId] : [])
    .map((id) => fiscalYearLabelById.get(id))
    .filter((label): label is string => Boolean(label))

  const handleExport = () => {
    const tabName = activeReport.id
    const tableEl = document.querySelector(`[data-report="${tabName}"] table`)
    if (tableEl) {
      exportTableToCsv(`[data-report="${tabName}"] table`, `${tabName}-report`)
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Scheduling analytics and compliance reports"
        actions={
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
      />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Report Center
                  </p>
                  <h2 className="text-base font-semibold">Operational analytics and compliance checks</h2>
                  <p className="text-sm text-muted-foreground">
                    Compare fiscal years, inspect assignment balance, and export tables directly to CSV.
                  </p>
                </div>
                <Badge variant="outline" className="whitespace-nowrap">
                  {reportTabs.length} report views
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Active Scope
              </p>
              <p className="text-sm font-semibold">{activeReport.label}</p>
              <p className="text-xs text-muted-foreground">
                {selectedLabels.length > 0
                  ? selectedLabels.join(", ")
                  : "Choose fiscal years below to render report data."}
              </p>
              {currentFiscalYear && (
                <p className="text-[11px] text-muted-foreground">
                  Current FY: <span className="font-medium text-foreground">{currentFiscalYear.label}</span>
                </p>
              )}
              <Badge variant="secondary" className="w-fit">
                {activeReport.scope === "multi" ? "Multi-year analysis" : "Single-year detail"}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTabId)}>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2 xl:grid-cols-5">
            {reportTabs.map((report) => {
              const Icon = report.icon
              return (
                <TabsTrigger
                  key={report.id}
                  value={report.id}
                  className="h-auto items-start justify-start rounded-xl border bg-card px-3 py-3 text-left shadow-sm transition-colors data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold leading-none">{report.label}</p>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {report.description}
                      </p>
                    </div>
                  </div>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <Card className="mt-4 mb-4">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Fiscal Year Scope
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isMultiTab
                      ? isYoyTab
                        ? "Select two or more fiscal years for year-over-year analysis."
                        : "Select one or more fiscal years for comparison."
                      : "Select exactly one fiscal year for this report."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {isMultiTab ? `${multiFyIds.length} selected` : singleFyId ? "1 selected" : "0 selected"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUseCurrentFiscalYear}
                    disabled={!currentFiscalYear?._id}
                  >
                    Use Current FY
                  </Button>
                </div>
              </div>
              <FiscalYearSelector
                fiscalYears={sortedFiscalYears}
                selected={isMultiTab ? multiFyIds : (singleFyId ? [singleFyId] : [])}
                onToggle={isMultiTab ? handleMultiToggle : handleSingleToggle}
                multi={isMultiTab}
                currentFiscalYearId={currentFiscalYear?._id ?? null}
              />
              {isMultiTab && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={handleUseCurrentAndPreviousFiscalYears}>
                    Current + Previous FY
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUseAllFiscalYears}
                    disabled={sortedFiscalYears.length <= 1}
                  >
                    All Years
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <TabsContent value="holiday" className="mt-0">
            <div data-report="holiday">
              <HolidayCoverageReport fiscalYearIds={multiFyIds} />
            </div>
          </TabsContent>
          <TabsContent value="rotation" className="mt-0">
            <div data-report="rotation">
              <RotationDistributionReport fiscalYearId={singleFyId} />
            </div>
          </TabsContent>
          <TabsContent value="cfte" className="mt-0">
            <div data-report="cfte">
              <CfteComplianceReport fiscalYearId={singleFyId} />
            </div>
          </TabsContent>
          <TabsContent value="trade" className="mt-0">
            <div data-report="trade">
              <TradeActivityReport fiscalYearId={singleFyId} />
            </div>
          </TabsContent>
          <TabsContent value="yoy" className="mt-0">
            <div data-report="yoy">
              <YoyTrendsReport fiscalYearIds={multiFyIds} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
