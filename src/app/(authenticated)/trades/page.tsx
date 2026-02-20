"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { ArrowLeftRight, Check, X, AlertTriangle, Loader2 } from "lucide-react"
import type { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/shared/components/ui/button"
import { useUserRole } from "@/hooks/use-user-role"

type ConvexReturn<T extends { _returnType: unknown }> = T["_returnType"]
type TradeRow = ConvexReturn<typeof api.functions.tradeRequests.getMyTrades>[number]
type AdminTradeRow = ConvexReturn<typeof api.functions.tradeRequests.getAdminTradeQueue>[number]

type Feedback = {
  kind: "success" | "error"
  message: string
}

function isRequester(trade: TradeRow, physicianId: string) {
  return String(trade.requestingPhysicianId) === physicianId
}

function isTarget(trade: TradeRow, physicianId: string) {
  return String(trade.targetPhysicianId) === physicianId
}

export default function TradesPage() {
  const { isLoading: roleLoading, isAdmin, physicianId } = useUserRole()
  const hasLinkedPhysician = Boolean(physicianId)

  const proposalOptions = useQuery(
    api.functions.tradeRequests.getTradeProposalOptions,
    hasLinkedPhysician ? {} : "skip",
  )
  const myTrades = useQuery(
    api.functions.tradeRequests.getMyTrades,
    hasLinkedPhysician ? {} : "skip",
  )
  const adminQueue = useQuery(
    api.functions.tradeRequests.getAdminTradeQueue,
    isAdmin ? {} : "skip",
  )

  const proposeTrade = useMutation(api.functions.tradeRequests.proposeTrade)
  const respondToTrade = useMutation(api.functions.tradeRequests.respondToTrade)
  const cancelTrade = useMutation(api.functions.tradeRequests.cancelTrade)
  const adminResolveTrade = useMutation(api.functions.tradeRequests.adminResolveTrade)

  const [requesterAssignmentId, setRequesterAssignmentId] = useState("")
  const [targetAssignmentId, setTargetAssignmentId] = useState("")
  const [reason, setReason] = useState("")
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const myAssignments = proposalOptions?.myAssignments ?? []
  const availableAssignments = proposalOptions?.availableAssignments ?? []

  useEffect(() => {
    if (myAssignments.length === 0) {
      setRequesterAssignmentId("")
      return
    }

    const selectionStillValid = myAssignments.some(
      (assignment) => String(assignment.assignmentId) === requesterAssignmentId,
    )

    if (!selectionStillValid) {
      setRequesterAssignmentId(String(myAssignments[0].assignmentId))
    }
  }, [myAssignments, requesterAssignmentId])

  useEffect(() => {
    if (availableAssignments.length === 0) {
      setTargetAssignmentId("")
      return
    }

    const selectionStillValid = availableAssignments.some(
      (assignment) => String(assignment.assignmentId) === targetAssignmentId,
    )

    if (!selectionStillValid) {
      setTargetAssignmentId(String(availableAssignments[0].assignmentId))
    }
  }, [availableAssignments, targetAssignmentId])

  const fiscalYearLabel = useMemo(() => {
    if (proposalOptions?.fiscalYear?.label) return proposalOptions.fiscalYear.label
    return "Trades & schedule swaps"
  }, [proposalOptions])

  const setSuccess = (message: string) => setFeedback({ kind: "success", message })
  const setError = (message: string) => setFeedback({ kind: "error", message })

  const handlePropose = async () => {
    if (!requesterAssignmentId || !targetAssignmentId) {
      setError("Select both a give assignment and a receive assignment.")
      return
    }

    setIsSubmittingProposal(true)
    setFeedback(null)

    try {
      await proposeTrade({
        requesterAssignmentId: requesterAssignmentId as Id<"assignments">,
        targetAssignmentId: targetAssignmentId as Id<"assignments">,
        reason: reason.trim() || undefined,
      })
      setReason("")
      setSuccess("Trade request submitted.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to submit trade request")
    } finally {
      setIsSubmittingProposal(false)
    }
  }

  const handleRespond = async (
    tradeRequestId: Id<"tradeRequests">,
    decision: "accept" | "decline",
  ) => {
    const actionKey = `${tradeRequestId}:${decision}`
    setBusyAction(actionKey)
    setFeedback(null)

    try {
      await respondToTrade({ tradeRequestId, decision })
      setSuccess(decision === "accept" ? "Trade accepted." : "Trade declined.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update trade")
    } finally {
      setBusyAction(null)
    }
  }

  const handleCancel = async (tradeRequestId: Id<"tradeRequests">) => {
    const actionKey = `${tradeRequestId}:cancel`
    setBusyAction(actionKey)
    setFeedback(null)

    try {
      await cancelTrade({ tradeRequestId })
      setSuccess("Trade cancelled.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to cancel trade")
    } finally {
      setBusyAction(null)
    }
  }

  const handleAdminResolve = async (
    tradeRequestId: Id<"tradeRequests">,
    approve: boolean,
  ) => {
    const actionKey = `${tradeRequestId}:${approve ? "approve" : "deny"}`
    setBusyAction(actionKey)
    setFeedback(null)

    try {
      await adminResolveTrade({ tradeRequestId, approve })
      setSuccess(approve ? "Trade approved and assignments swapped." : "Trade denied.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to resolve trade")
    } finally {
      setBusyAction(null)
    }
  }

  if (roleLoading) {
    return (
      <>
        <PageHeader title="Trades" description="Request and manage schedule swaps" />
        <PageSkeleton />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Trades"
        description={hasLinkedPhysician ? fiscalYearLabel : "Request and manage schedule swaps"}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {feedback && (
          <div
            className={
              feedback.kind === "success"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            }
          >
            {feedback.message}
          </div>
        )}

        {hasLinkedPhysician ? (
          <>
            <section className="rounded-lg border p-4 md:p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Propose trade</h2>
                <p className="text-sm text-muted-foreground">
                  Swap one of your assignments with another physician for the published fiscal year.
                </p>
              </div>

              {proposalOptions === undefined ? (
                <PageSkeleton />
              ) : !proposalOptions.enabled ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-amber-800">
                    {proposalOptions.reason ?? "Trades are currently unavailable."}
                  </span>
                </div>
              ) : myAssignments.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No eligible assignments"
                  description="You do not have assignments in the published calendar yet."
                />
              ) : availableAssignments.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No swap candidates"
                  description="No assignments from other physicians are currently available to trade."
                />
              ) : (
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">Give assignment</span>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={requesterAssignmentId}
                      onChange={(event) => setRequesterAssignmentId(event.target.value)}
                      disabled={isSubmittingProposal}
                    >
                      {myAssignments.map((assignment) => (
                        <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                          {assignment.weekLabel} - {assignment.rotationLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">Receive assignment</span>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={targetAssignmentId}
                      onChange={(event) => setTargetAssignmentId(event.target.value)}
                      disabled={isSubmittingProposal}
                    >
                      {availableAssignments.map((assignment) => (
                        <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                          {assignment.weekLabel} - {assignment.rotationLabel} ({assignment.physicianName})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-sm font-medium">Reason (optional)</span>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      disabled={isSubmittingProposal}
                      placeholder="Add context for the target physician and admin reviewer"
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="flex justify-end">
                    <Button
                      onClick={handlePropose}
                      disabled={isSubmittingProposal || !requesterAssignmentId || !targetAssignmentId}
                    >
                      {isSubmittingProposal && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Submit trade request
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-lg border p-4 md:p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">My trade requests</h2>
                <p className="text-sm text-muted-foreground">
                  Track current status and respond to incoming requests.
                </p>
              </div>

              {myTrades === undefined ? (
                <PageSkeleton />
              ) : myTrades.length === 0 ? (
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No trade requests"
                  description="Your proposed and received trades will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {myTrades.map((trade) => {
                    const requester = isRequester(trade, String(physicianId))
                    const target = isTarget(trade, String(physicianId))

                    const canCancel = requester && (trade.status === "proposed" || trade.status === "peer_accepted")
                    const canAccept = target && trade.status === "proposed"
                    const canDecline = target && trade.status === "proposed"

                    const cancelKey = `${trade._id}:cancel`
                    const acceptKey = `${trade._id}:accept`
                    const declineKey = `${trade._id}:decline`

                    return (
                      <div key={String(trade._id)} className="rounded-lg border p-4 space-y-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {trade.requesterName} ↔ {trade.targetName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Give: {trade.requesterWeekLabel} - {trade.requesterRotationLabel}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Get: {trade.targetWeekLabel} - {trade.targetRotationLabel}
                            </p>
                            {trade.reason && (
                              <p className="text-xs text-muted-foreground">Reason: {trade.reason}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Requested: {new Date(trade.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge status={trade.status} />
                        </div>

                        {(canCancel || canAccept || canDecline) && (
                          <div className="flex flex-wrap gap-2">
                            {canAccept && (
                              <Button
                                size="sm"
                                onClick={() => handleRespond(trade._id, "accept")}
                                disabled={busyAction === acceptKey}
                              >
                                {busyAction === acceptKey && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                <Check className="mr-1 h-3 w-3" />
                                Accept
                              </Button>
                            )}

                            {canDecline && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRespond(trade._id, "decline")}
                                disabled={busyAction === declineKey}
                              >
                                {busyAction === declineKey && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                <X className="mr-1 h-3 w-3" />
                                Decline
                              </Button>
                            )}

                            {canCancel && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancel(trade._id)}
                                disabled={busyAction === cancelKey}
                              >
                                {busyAction === cancelKey && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                Cancel
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium">Physician profile required for self-service trade actions</p>
            <p className="text-muted-foreground mt-1">
              Your account is not linked to a physician profile. Ask an admin to link your email alias.
            </p>
          </div>
        )}

        {isAdmin && (
          <section className="rounded-lg border p-4 md:p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Admin trade queue</h2>
              <p className="text-sm text-muted-foreground">
                Approve peer-accepted swaps or deny open trade requests.
              </p>
            </div>

            {adminQueue === undefined ? (
              <PageSkeleton />
            ) : adminQueue.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No trades awaiting admin review"
                description="Proposed or peer-accepted requests will appear here."
              />
            ) : (
              <div className="space-y-3">
                {adminQueue.map((trade: AdminTradeRow) => {
                  const approveKey = `${trade._id}:approve`
                  const denyKey = `${trade._id}:deny`

                  return (
                    <div key={String(trade._id)} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {trade.requesterName} ↔ {trade.targetName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Give: {trade.requesterWeekLabel} - {trade.requesterRotationLabel}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Get: {trade.targetWeekLabel} - {trade.targetRotationLabel}
                          </p>
                          {trade.reason && (
                            <p className="text-xs text-muted-foreground">Reason: {trade.reason}</p>
                          )}
                        </div>
                        <StatusBadge status={trade.status} />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAdminResolve(trade._id, true)}
                          disabled={trade.status !== "peer_accepted" || busyAction === approveKey}
                        >
                          {busyAction === approveKey && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          <Check className="mr-1 h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdminResolve(trade._id, false)}
                          disabled={busyAction === denyKey}
                        >
                          {busyAction === denyKey && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          <X className="mr-1 h-3 w-3" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  )
}
