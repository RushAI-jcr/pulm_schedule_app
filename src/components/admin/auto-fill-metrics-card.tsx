"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface AutoFillMetrics {
  totalCells: number
  filledCells: number
  unfilledCells: number
  avgScore: number
  holidayParityScore: number
  cfteVariance: number
  preferencesSatisfied: number
  workloadStdDev: number
}

function scoreColor(value: number, thresholds: [number, number]): string {
  if (value >= thresholds[0]) return "text-emerald-600"
  if (value >= thresholds[1]) return "text-amber-600"
  return "text-rose-600"
}

function varianceColor(value: number): string {
  if (value <= 0.02) return "text-emerald-600"
  if (value <= 0.05) return "text-amber-600"
  return "text-rose-600"
}

interface AutoFillMetricsCardProps {
  metrics: AutoFillMetrics
  className?: string
}

export function AutoFillMetricsCard({ metrics, className }: AutoFillMetricsCardProps) {
  const fillRate = metrics.totalCells > 0
    ? Math.round((metrics.filledCells / metrics.totalCells) * 100)
    : 0

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Auto-Fill Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Fill Rate */}
          <div>
            <p className="text-xs text-muted-foreground">Filled</p>
            <p className={cn("text-lg font-bold", scoreColor(fillRate, [95, 80]))}>
              {metrics.filledCells}/{metrics.totalCells}
            </p>
            <p className="text-[10px] text-muted-foreground">{fillRate}% fill rate</p>
          </div>

          {/* Average Score */}
          <div>
            <p className="text-xs text-muted-foreground">Avg Score</p>
            <p className={cn("text-lg font-bold", scoreColor(metrics.avgScore, [60, 40]))}>
              {metrics.avgScore.toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground">out of 100</p>
          </div>

          {/* Preference Satisfaction */}
          <div>
            <p className="text-xs text-muted-foreground">Green Weeks</p>
            <p className={cn("text-lg font-bold", scoreColor(metrics.preferencesSatisfied, [70, 50]))}>
              {metrics.preferencesSatisfied.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">preference satisfied</p>
          </div>

          {/* Workload Spread */}
          <div>
            <p className="text-xs text-muted-foreground">Workload StdDev</p>
            <p className={cn("text-lg font-bold", varianceColor(metrics.workloadStdDev))}>
              {metrics.workloadStdDev.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">weeks spread</p>
          </div>

          {/* Holiday Parity */}
          <div>
            <p className="text-xs text-muted-foreground">Holiday Parity</p>
            <p className={cn("text-lg font-bold", scoreColor(metrics.holidayParityScore, [80, 50]))}>
              {metrics.holidayParityScore.toFixed(0)}
            </p>
            <p className="text-[10px] text-muted-foreground">out of 100</p>
          </div>

          {/* cFTE Variance */}
          <div>
            <p className="text-xs text-muted-foreground">cFTE Variance</p>
            <p className={cn("text-lg font-bold", varianceColor(metrics.cfteVariance))}>
              {metrics.cfteVariance.toFixed(4)}
            </p>
            <p className="text-[10px] text-muted-foreground">std deviation</p>
          </div>

          {/* Unfilled */}
          <div>
            <p className="text-xs text-muted-foreground">Unfilled</p>
            <p className={cn(
              "text-lg font-bold",
              metrics.unfilledCells === 0 ? "text-emerald-600" : "text-rose-600",
            )}>
              {metrics.unfilledCells}
            </p>
            <p className="text-[10px] text-muted-foreground">cells remaining</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
