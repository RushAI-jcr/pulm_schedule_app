"use client"

import { useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import { FileText, Check, X, Clock, CheckCircle2, AlertTriangle } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

function ScheduleRequestsTab() {
  const data = useQuery(api.functions.scheduleRequests.getAdminScheduleRequests)

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={FileText}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const requests = data.requests ?? []
  const submitted = requests.filter((r) => r.status === "submitted")
  const revised = requests.filter((r) => r.status === "revised")
  const drafts = requests.filter((r) => r.status === "draft")

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">{data.fiscalYear.label}</p>
        <Badge variant="secondary">{submitted.length + revised.length} submitted</Badge>
        <Badge variant="outline">{drafts.length} draft</Badge>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_100px_120px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground hidden md:grid">
          <span>Physician</span>
          <span className="text-center">Status</span>
          <span className="text-center">Submitted</span>
          <span className="text-center">Special Requests</span>
        </div>
        {requests.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No schedule requests yet.
          </p>
        ) : (
          requests.map((req) => (
            <div
              key={String(req._id)}
              className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_120px] gap-2 items-center px-4 py-3 border-b last:border-b-0"
            >
              <span className="text-sm font-medium">
                {(req as any).physicianName ?? String(req.physicianId).slice(-6)}
              </span>
              <div className="flex justify-center">
                <StatusBadge status={req.status} />
              </div>
              <span className="text-center text-xs text-muted-foreground">
                {req.submittedAt
                  ? new Date(req.submittedAt).toLocaleDateString()
                  : "—"}
              </span>
              <span className="text-center text-xs text-muted-foreground truncate max-w-[120px]">
                {req.specialRequests || "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TradeApprovalTab() {
  const data = useQuery(api.functions.tradeRequests.getAdminTradeQueue)
  const adminResolve = useMutation(api.functions.tradeRequests.adminResolveTrade)

  if (data === undefined) return <PageSkeleton />

  const trades = data ?? []
  const pending = trades.filter((t: { status: string }) => t.status === "peer_accepted")
  const resolved = trades.filter((t: { status: string }) => t.status !== "proposed" && t.status !== "peer_accepted")

  const handleResolve = async (tradeId: string, approve: boolean) => {
    try {
      await adminResolve({ tradeRequestId: tradeId as Id<"tradeRequests">, approve })
    } catch {
      // Error handled by Convex
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{pending.length} pending</Badge>
        <Badge variant="outline">{resolved.length} resolved</Badge>
      </div>

      {pending.length === 0 && resolved.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No trade requests"
          description="Trade requests from physicians will appear here for approval."
        />
      ) : (
        <div className="space-y-2">
          {pending.map((trade: any) => (
            <div
              key={String(trade._id)}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <p className="text-sm font-medium">
                  {trade.requesterName ?? "Physician"} &rarr; {trade.targetName ?? "Physician"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {trade.requesterWeekLabel} &middot; {trade.requesterRotationLabel}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResolve(String(trade._id), false)}
                >
                  <X className="mr-1 h-3 w-3" />
                  Deny
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleResolve(String(trade._id), true)}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Approve
                </Button>
              </div>
            </div>
          ))}
          {resolved.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-muted-foreground mt-4 mb-2">Resolved</h4>
              {resolved.slice(0, 20).map((trade: any) => (
                <div
                  key={String(trade._id)}
                  className="flex items-center justify-between rounded-lg border p-3 opacity-60"
                >
                  <p className="text-sm">
                    {trade.requesterName ?? "Physician"} &rarr; {trade.targetName ?? "Physician"}
                  </p>
                  <StatusBadge status={trade.status} />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PreferenceMatrixTab() {
  const data = useQuery(api.functions.rotationPreferences.getAdminRotationPreferenceMatrix)
  const approveMutation = useMutation(api.functions.rotationPreferences.approveRotationPreferencesForMapping)

  if (data === undefined) return <PageSkeleton />
  if (!data?.fiscalYear) {
    return (
      <EmptyState
        icon={FileText}
        title="No active fiscal year"
        description="Create and activate a fiscal year first."
      />
    )
  }

  const handleApprove = async (physicianId: string) => {
    try {
      await approveMutation({ physicianId: physicianId as Id<"physicians"> })
    } catch {
      // Error handled by Convex
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{data.fiscalYear.label}</p>
        <Badge variant="secondary">
          {data.summary.readyForMappingCount} ready
        </Badge>
        <Badge variant="outline">
          {data.summary.pendingApprovalCount} pending approval
        </Badge>
        {data.summary.incompleteCount > 0 && (
          <Badge variant="destructive">
            {data.summary.incompleteCount} incomplete
          </Badge>
        )}
      </div>

      {!data.rotationConfiguration.isValid && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-800 dark:text-amber-300">
            {data.rotationConfiguration.blockingReason}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50">Physician</th>
              {data.rotations.map((r) => (
                <th key={String(r._id)} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  {r.abbreviation}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={String(row.physicianId)} className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-background">
                  {row.physicianName}
                </td>
                {row.preferences.map((pref) => {
                  const p = pref.preference
                  let display = "—"
                  let colorClass = "text-muted-foreground/30"
                  if (p) {
                    if (p.avoid) {
                      display = "X"
                      colorClass = "text-rose-600 font-bold"
                    } else if (p.deprioritize) {
                      display = "↓"
                      colorClass = "text-orange-600"
                    } else if (p.preferenceRank !== undefined) {
                      display = `#${p.preferenceRank}`
                      colorClass = "text-amber-600 font-bold"
                    } else {
                      display = "✓"
                      colorClass = "text-emerald-600"
                    }
                  }
                  return (
                    <td key={String(pref.rotationId)} className={cn("px-2 py-2 text-center text-xs", colorClass)}>
                      {display}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center">
                  <Badge
                    variant={row.isReadyForMapping ? "secondary" : "outline"}
                    className={cn(
                      "text-[10px]",
                      row.isReadyForMapping && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    )}
                  >
                    {row.isReadyForMapping
                      ? "Ready"
                      : row.approvalStatus === "approved"
                        ? "Approved"
                        : `${row.configuredCount}/${row.requiredCount}`}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  {row.approvalStatus === "pending" && row.configuredCount === row.requiredCount && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs"
                      onClick={() => handleApprove(String(row.physicianId))}
                    >
                      Approve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RequestsPage() {
  return (
    <>
      <PageHeader title="Schedule Requests" description="Review physician preferences and trade requests" />
      <div className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="requests">
          <TabsList>
            <TabsTrigger value="requests">Schedule Requests</TabsTrigger>
            <TabsTrigger value="trades">Trade Approval</TabsTrigger>
            <TabsTrigger value="matrix">Preference Matrix</TabsTrigger>
          </TabsList>
          <TabsContent value="requests" className="mt-4">
            <ScheduleRequestsTab />
          </TabsContent>
          <TabsContent value="trades" className="mt-4">
            <TradeApprovalTab />
          </TabsContent>
          <TabsContent value="matrix" className="mt-4">
            <PreferenceMatrixTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
