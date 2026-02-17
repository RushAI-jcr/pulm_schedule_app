"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { TrendingUp } from "lucide-react"

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
]

export function YoyTrendsReport({
  fiscalYearIds,
}: {
  fiscalYearIds: Id<"fiscalYears">[]
}) {
  const data = useQuery(
    api.functions.reports.getYearOverYearReport,
    fiscalYearIds.length > 0 ? { fiscalYearIds } : "skip",
  )

  if (fiscalYearIds.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Select fiscal years"
        description="Choose two or more fiscal years to compare workload trends."
      />
    )
  }

  if (data === undefined) return <PageSkeleton />
  if (!data || data.data.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No data available"
        description="No assignment data found for the selected fiscal years."
      />
    )
  }

  const { fiscalYears } = data
  const workloadSummary: Array<{
    physicianId: string
    physicianInitials: string
    physicianName: string
    weeksByFiscalYear: Record<string, number>
  }> = data.workloadSummary ?? []

  // Stacked bar chart: each physician, stacked by FY
  const chartData = workloadSummary.map((p) => {
    const row: Record<string, string | number> = { physician: p.physicianInitials }
    for (const fy of fiscalYears as Array<{ _id: string; label: string }>) {
      row[fy.label] = p.weeksByFiscalYear[fy._id] ?? 0
    }
    return row
  })

  const chartConfig: Record<string, { label: string; color: string }> = {}
  ;(fiscalYears as Array<{ _id: string; label: string }>).forEach((fy, i) => {
    chartConfig[fy.label] = {
      label: fy.label,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  return (
    <div className="space-y-6">
      {/* Total workload comparison chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Total assigned weeks by fiscal year</h3>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="physician" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} label={{ value: "Weeks", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {(fiscalYears as Array<{ _id: string; label: string }>).map((fy, i) => (
                <Bar
                  key={fy._id}
                  dataKey={fy.label}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Comparison table */}
      <div className="rounded-lg border">
        <div className="px-4 py-2 border-b bg-muted/50">
          <h3 className="text-xs font-semibold text-muted-foreground">Workload comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50">Physician</th>
                {(fiscalYears as Array<{ _id: string; label: string }>).map((fy) => (
                  <th key={fy._id} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    {fy.label}
                  </th>
                ))}
                {fiscalYears.length >= 2 && (
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Change</th>
                )}
              </tr>
            </thead>
            <tbody>
              {workloadSummary.map((p) => {
                const fyList = fiscalYears as Array<{ _id: string; label: string }>
                const firstFy = fyList[0]
                const lastFy = fyList[fyList.length - 1]
                const firstVal = p.weeksByFiscalYear[firstFy._id] ?? 0
                const lastVal = p.weeksByFiscalYear[lastFy._id] ?? 0
                const change = lastVal - firstVal

                return (
                  <tr key={p.physicianId} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 bg-background">
                      {p.physicianName}
                    </td>
                    {fyList.map((fy) => (
                      <td key={fy._id} className="px-3 py-2 text-center">
                        {p.weeksByFiscalYear[fy._id] ?? 0}
                      </td>
                    ))}
                    {fyList.length >= 2 && (
                      <td className={`px-3 py-2 text-center text-xs font-medium ${
                        change > 0 ? "text-rose-600" : change < 0 ? "text-emerald-600" : "text-muted-foreground"
                      }`}>
                        {change > 0 ? `+${change}` : change === 0 ? "—" : change}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
