"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
]

export function RotationDistributionReport({
  fiscalYearId,
}: {
  fiscalYearId: Id<"fiscalYears"> | null
}) {
  const data = useQuery(
    api.functions.reports.getRotationDistributionReport,
    fiscalYearId ? { fiscalYearId } : "skip",
  )

  if (!fiscalYearId) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Select a fiscal year"
        description="Choose a fiscal year to view rotation distribution."
      />
    )
  }

  if (data === undefined) return <PageSkeleton />
  if (!data) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No data available"
        description="No calendar data found for this fiscal year."
      />
    )
  }

  const { rotations, physicians, matrix } = data

  // Build chart data: each physician is a bar group, with stacked rotations
  const chartData = physicians.map((p: { _id: string; initials: string; name: string }) => {
    const row: Record<string, string | number> = { physician: p.initials }
    for (const r of rotations as Array<{ _id: string; abbreviation: string }>) {
      row[r.abbreviation] = matrix[p._id]?.[r._id] ?? 0
    }
    return row
  })

  const chartConfig: Record<string, { label: string; color: string }> = {}
  ;(rotations as Array<{ _id: string; abbreviation: string; name: string }>).forEach((r, i) => {
    chartConfig[r.abbreviation] = {
      label: r.name,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  // Find max weeks for heatmap intensity
  let maxWeeks = 0
  for (const p of physicians as Array<{ _id: string }>) {
    for (const r of rotations as Array<{ _id: string }>) {
      const val = matrix[p._id]?.[r._id] ?? 0
      if (val > maxWeeks) maxWeeks = val
    }
  }

  return (
    <div className="space-y-6">
      {/* Stacked bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Weeks per rotation by physician</h3>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="physician" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} label={{ value: "Weeks", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {(rotations as Array<{ _id: string; abbreviation: string }>).map((r, i) => (
                <Bar
                  key={r._id}
                  dataKey={r.abbreviation}
                  stackId="a"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Heatmap table */}
      <div className="rounded-lg border">
        <div className="px-4 py-2 border-b bg-muted/50">
          <h3 className="text-xs font-semibold text-muted-foreground">Distribution matrix (weeks assigned)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50">Physician</th>
                {(rotations as Array<{ _id: string; abbreviation: string }>).map((r) => (
                  <th key={r._id} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    {r.abbreviation}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {(physicians as Array<{ _id: string; initials: string; name: string }>).map((p) => {
                let total = 0
                return (
                  <tr key={p._id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 bg-background">
                      {p.name}
                    </td>
                    {(rotations as Array<{ _id: string }>).map((r) => {
                      const val = matrix[p._id]?.[r._id] ?? 0
                      total += val
                      const intensity = maxWeeks > 0 ? val / maxWeeks : 0
                      return (
                        <td
                          key={r._id}
                          className={cn(
                            "px-2 py-2 text-center text-xs",
                            val === 0 && "text-muted-foreground/30",
                          )}
                          style={
                            val > 0
                              ? { backgroundColor: `hsl(152 100% 19% / ${(intensity * 0.3 + 0.05).toFixed(2)})` }
                              : undefined
                          }
                        >
                          {val || "—"}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center font-bold">{total}</td>
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
