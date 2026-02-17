"use client"

import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { MetricCard } from "@/components/shared/metric-card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts"
import { ArrowLeftRight } from "lucide-react"

const STATUS_COLORS: Record<string, string> = {
  proposed: "hsl(var(--chart-3))",
  peer_accepted: "hsl(var(--chart-2))",
  peer_declined: "hsl(var(--chart-5))",
  admin_approved: "hsl(var(--chart-1))",
  admin_denied: "hsl(0 84% 60%)",
  cancelled: "hsl(var(--muted-foreground))",
}

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  peer_accepted: "Peer accepted",
  peer_declined: "Peer declined",
  admin_approved: "Approved",
  admin_denied: "Denied",
  cancelled: "Cancelled",
}

export function TradeActivityReport({
  fiscalYearId,
}: {
  fiscalYearId: Id<"fiscalYears"> | null
}) {
  const data = useQuery(
    api.functions.reports.getTradeActivityReport,
    fiscalYearId ? { fiscalYearId } : "skip",
  )

  if (!fiscalYearId) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Select a fiscal year"
        description="Choose a fiscal year to view trade activity."
      />
    )
  }

  if (data === undefined) return <PageSkeleton />
  if (!data) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No data available"
        description="No trade data found for this fiscal year."
      />
    )
  }

  // Status pie chart
  const pieData = Object.entries(data.statusCounts as Record<string, number>).map(([status, count]) => ({
    name: STATUS_LABELS[status] ?? status,
    value: count,
    fill: STATUS_COLORS[status] ?? "hsl(var(--muted-foreground))",
  }))

  const pieConfig: Record<string, { label: string; color: string }> = {}
  for (const d of pieData) {
    pieConfig[d.name] = { label: d.name, color: d.fill }
  }

  // Monthly volume bar chart
  const monthlyConfig = {
    count: { label: "Trades", color: "hsl(var(--chart-1))" },
  }

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="Total trades" value={data.totalTrades} />
        <MetricCard label="Approval rate" value={`${data.approvalRate}%`} />
        <MetricCard label="Avg resolution" value={`${data.avgResolutionDays}d`} />
        <MetricCard
          label="Most active"
          value={data.topTraders.length > 0 ? data.topTraders[0].initials : "—"}
          subValue={data.topTraders.length > 0 ? `${data.topTraders[0].total} trades` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly volume */}
        {data.monthlyVolume.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold mb-4">Monthly trade volume</h3>
            <ChartContainer config={monthlyConfig} className="h-[250px]">
              <BarChart data={data.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Status breakdown */}
        {pieData.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold mb-4">Status breakdown</h3>
            <ChartContainer config={pieConfig} className="h-[250px]">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </div>
        )}
      </div>

      {/* Top traders table */}
      {data.topTraders.length > 0 && (
        <div className="rounded-lg border">
          <div className="px-4 py-2 border-b bg-muted/50">
            <h3 className="text-xs font-semibold text-muted-foreground">Physician trade activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Physician</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Initiated</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Received</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Approved</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Denied</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topTraders.map((t: {
                  physicianId: string
                  name: string
                  initials: string
                  initiated: number
                  received: number
                  approved: number
                  denied: number
                  total: number
                }) => (
                  <tr key={t.physicianId} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      {t.name}
                      <span className="text-xs text-muted-foreground ml-1">({t.initials})</span>
                    </td>
                    <td className="px-3 py-2 text-center">{t.initiated}</td>
                    <td className="px-3 py-2 text-center">{t.received}</td>
                    <td className="px-3 py-2 text-center text-emerald-600">{t.approved}</td>
                    <td className="px-3 py-2 text-center text-rose-600">{t.denied}</td>
                    <td className="px-3 py-2 text-center font-bold">{t.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
