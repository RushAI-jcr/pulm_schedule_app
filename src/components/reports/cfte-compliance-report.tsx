"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { MetricCard } from "@/components/shared/metric-card"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Cell } from "recharts"
import { Target } from "lucide-react"
import { cn } from "@/lib/utils"

export function CfteComplianceReport({
  fiscalYearId,
}: {
  fiscalYearId: Id<"fiscalYears"> | null
}) {
  const data = useQuery(
    api.functions.reports.getCfteComplianceReport,
    fiscalYearId ? { fiscalYearId } : "skip",
  )

  if (!fiscalYearId) {
    return (
      <EmptyState
        icon={Target}
        title="Select a fiscal year"
        description="Choose a fiscal year to view cFTE compliance."
      />
    )
  }

  if (data === undefined) return <PageSkeleton />
  if (!data) {
    return (
      <EmptyState
        icon={Target}
        title="No data available"
        description="No cFTE data found for this fiscal year."
      />
    )
  }

  const { rows, summary } = data

  // Chart data: actual vs target grouped bars
  const chartData = rows
    .filter((r: { targetCfte: number | null }) => r.targetCfte !== null)
    .map((r: { initials: string; actualCfte: number; targetCfte: number | null; status: string }) => ({
      physician: r.initials,
      actual: r.actualCfte,
      target: r.targetCfte,
      status: r.status,
    }))

  const chartConfig = {
    actual: { label: "Actual cFTE", color: "hsl(var(--chart-1))" },
    target: { label: "Target cFTE", color: "hsl(var(--chart-2))" },
  }

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="Total physicians" value={summary.totalPhysicians} />
        <MetricCard label="With targets" value={summary.withTarget} />
        <MetricCard label="Compliant" value={`${summary.complianceRate}%`} subValue={`${summary.compliantCount} of ${summary.withTarget}`} />
        <MetricCard label="Avg variance" value={summary.avgVariance.toFixed(3)} />
      </div>

      {/* Grouped bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Actual vs target cFTE</h3>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="physician" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="target" fill="hsl(var(--chart-2))" opacity={0.5} radius={[2, 2, 0, 0]} />
              <Bar dataKey="actual" radius={[2, 2, 0, 0]}>
                {chartData.map((entry: { status: string }, index: number) => (
                  <Cell
                    key={index}
                    fill={
                      entry.status === "compliant"
                        ? "hsl(152 100% 19%)"
                        : entry.status === "over"
                          ? "hsl(0 84% 60%)"
                          : "hsl(38 92% 50%)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-lg border">
        <div className="px-4 py-2 border-b bg-muted/50">
          <h3 className="text-xs font-semibold text-muted-foreground">cFTE detail</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Physician</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Rotation</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Actual</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Target</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Variance</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: {
                physicianId: string
                name: string
                initials: string
                rotationCfte: number
                clinicCfte: number
                actualCfte: number
                targetCfte: number | null
                variance: number | null
                status: string
              }) => (
                <tr key={r.physicianId} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {r.name}
                    <span className="text-xs text-muted-foreground ml-1">({r.initials})</span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs">{r.rotationCfte.toFixed(3)}</td>
                  <td className="px-3 py-2 text-center text-xs">{r.clinicCfte.toFixed(3)}</td>
                  <td className="px-3 py-2 text-center font-bold">{r.actualCfte.toFixed(3)}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.targetCfte !== null ? r.targetCfte.toFixed(2) : "—"}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-center text-xs font-medium",
                    r.variance !== null && r.variance > 0.05 && "text-rose-600",
                    r.variance !== null && r.variance < -0.05 && "text-amber-600",
                    r.variance !== null && Math.abs(r.variance) <= 0.05 && "text-emerald-600",
                  )}>
                    {r.variance !== null
                      ? `${r.variance >= 0 ? "+" : ""}${r.variance.toFixed(3)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        r.status === "compliant" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                        r.status === "over" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
                        r.status === "under" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        r.status === "no_target" && "text-muted-foreground",
                      )}
                    >
                      {r.status === "no_target" ? "no target" : r.status}
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
