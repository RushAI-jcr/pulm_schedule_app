"use client"

import { useState, useCallback } from "react"
import { useQuery } from "convex/react"
import { BarChart3, Download } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/shared/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HolidayCoverageReport } from "@/components/reports/holiday-coverage-report"
import { RotationDistributionReport } from "@/components/reports/rotation-distribution-report"
import { CfteComplianceReport } from "@/components/reports/cfte-compliance-report"
import { TradeActivityReport } from "@/components/reports/trade-activity-report"
import { YoyTrendsReport } from "@/components/reports/yoy-trends-report"
import { cn } from "@/lib/utils"

function FiscalYearSelector({
  fiscalYears,
  selected,
  onToggle,
  multi,
}: {
  fiscalYears: Array<{ _id: Id<"fiscalYears">; label: string; status: string }>
  selected: Id<"fiscalYears">[]
  onToggle: (id: Id<"fiscalYears">) => void
  multi?: boolean
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
  const [activeTab, setActiveTab] = useState("holiday")

  // Single FY selection (for rotation, cfte, trade)
  const [singleFyId, setSingleFyId] = useState<Id<"fiscalYears"> | null>(null)
  // Multi FY selection (for holiday, yoy)
  const [multiFyIds, setMultiFyIds] = useState<Id<"fiscalYears">[]>([])

  // Auto-select the first available FY once data loads
  const firstFyRef = useCallback(
    (fys: Array<{ _id: Id<"fiscalYears"> }>) => {
      if (fys.length > 0 && singleFyId === null) {
        setSingleFyId(fys[0]._id)
      }
      if (fys.length > 0 && multiFyIds.length === 0) {
        setMultiFyIds([fys[0]._id])
      }
    },
    [singleFyId, multiFyIds.length],
  )

  if (fiscalYears === undefined) {
    return (
      <>
        <PageHeader title="Reports" description="Scheduling analytics and compliance reports" />
        <PageSkeleton />
      </>
    )
  }

  if (fiscalYears.length === 0) {
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

  // Auto-select on first render
  if (singleFyId === null || multiFyIds.length === 0) {
    firstFyRef(fiscalYears)
  }

  const handleSingleToggle = (id: Id<"fiscalYears">) => {
    setSingleFyId(id)
  }

  const handleMultiToggle = (id: Id<"fiscalYears">) => {
    setMultiFyIds((prev) =>
      prev.includes(id)
        ? prev.filter((fid) => fid !== id)
        : [...prev, id],
    )
  }

  const isMultiTab = activeTab === "holiday" || activeTab === "yoy"

  const handleExport = () => {
    const tabName = activeTab
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
      <div className="flex-1 p-4 md:p-6 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="holiday" className="text-xs">Holiday Coverage</TabsTrigger>
            <TabsTrigger value="rotation" className="text-xs">Rotation Distribution</TabsTrigger>
            <TabsTrigger value="cfte" className="text-xs">cFTE Compliance</TabsTrigger>
            <TabsTrigger value="trade" className="text-xs">Trade Activity</TabsTrigger>
            <TabsTrigger value="yoy" className="text-xs">Year-over-Year</TabsTrigger>
          </TabsList>

          <div className="mt-4 mb-4">
            <FiscalYearSelector
              fiscalYears={fiscalYears}
              selected={isMultiTab ? multiFyIds : (singleFyId ? [singleFyId] : [])}
              onToggle={isMultiTab ? handleMultiToggle : handleSingleToggle}
              multi={isMultiTab}
            />
          </div>

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
