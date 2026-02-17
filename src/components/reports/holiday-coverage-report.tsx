"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { MetricCard } from "@/components/shared/metric-card"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
]

export function HolidayCoverageReport({
  fiscalYearIds,
}: {
  fiscalYearIds: Id<"fiscalYears">[]
}) {
  const data = useQuery(
    api.functions.reports.getHolidayCoverageReport,
    fiscalYearIds.length > 0 ? { fiscalYearIds } : "skip",
  )

  if (fiscalYearIds.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Select fiscal years"
        description="Choose one or more fiscal years to view holiday coverage data."
      />
    )
  }

  if (data === undefined) return <PageSkeleton />
  if (!data || data.coverage.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No holiday coverage data"
        description="No published calendars with holiday assignments found for the selected fiscal years."
      />
    )
  }

  // Group coverage by holiday for bar chart
  const holidayGroups = new Map<string, Map<string, number>>()
  for (const c of data.coverage) {
    const key = c.holidayName
    if (!holidayGroups.has(key)) holidayGroups.set(key, new Map())
    const physicianCounts = holidayGroups.get(key)!
    physicianCounts.set(
      c.physicianInitials,
      (physicianCounts.get(c.physicianInitials) ?? 0) + 1,
    )
  }

  // Get unique physician initials for chart series
  const allInitials = [...new Set(data.coverage.map((c: { physicianInitials: string }) => c.physicianInitials))]

  const chartData = [...holidayGroups.entries()].map(([holiday, physicianCounts]) => {
    const row: Record<string, string | number> = { holiday }
    for (const initials of allInitials) {
      row[initials] = physicianCounts.get(initials) ?? 0
    }
    return row
  })

  const chartConfig: Record<string, { label: string; color: string }> = {}
  allInitials.forEach((initials, i) => {
    chartConfig[initials] = {
      label: initials,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Avg holidays/physician" value={data.avgHolidays ?? 0} />
        <MetricCard
          label="Physicians tracked"
          value={data.fairness?.length ?? 0}
        />
        <MetricCard
          label="Fiscal years"
          value={data.fiscalYears.map((fy: { label: string }) => fy.label).join(", ")}
        />
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Holiday assignments by physician</h3>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="holiday" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {allInitials.map((initials, i) => (
                <Bar
                  key={initials}
                  dataKey={initials}
                  stackId="a"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Fairness table */}
      <div className="rounded-lg border">
        <div className="px-4 py-2 border-b bg-muted/50">
          <h3 className="text-xs font-semibold text-muted-foreground">Equity Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Physician</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Holiday weeks</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Equity</th>
              </tr>
            </thead>
            <tbody>
              {(data.fairness ?? []).map((f: { physicianId: string; physicianName: string; physicianInitials: string; holidayCount: number; equity: string }) => (
                <tr key={f.physicianId} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium">
                    {f.physicianName}
                    <span className="text-xs text-muted-foreground ml-1">({f.physicianInitials})</span>
                  </td>
                  <td className="px-3 py-2 text-center font-bold">{f.holidayCount}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        f.equity === "fair" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                        f.equity === "overloaded" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
                        f.equity === "underloaded" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                      )}
                    >
                      {f.equity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
