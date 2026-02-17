"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignInForm } from "@/features/auth/components/SignInForm";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";
import { toast, Toaster } from "sonner";
import { useEffect, useMemo, useState } from "react";

export default function TradesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/85">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-primary md:text-lg">Rush PCCM Calendar Assistant</h2>
          <span className="text-sm text-gray-600 dark:text-slate-300">Trades & Swaps</span>
          <Link
            href="/"
            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700"
          >
            Back to Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Authenticated>
            <SignOutButton />
          </Authenticated>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-6xl mx-auto">
          <Unauthenticated>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm space-y-4 max-w-md mx-auto">
              <h3 className="text-lg font-semibold dark:text-slate-100">Sign in to manage trades</h3>
              <SignInForm />
            </div>
          </Unauthenticated>
          <Authenticated>
            <TradesWorkspace />
          </Authenticated>
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function TradesWorkspace() {
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const myProfile = useQuery(api.functions.physicians.getMyProfile);
  const linkCurrentUser = useMutation(api.functions.physicians.linkCurrentUserToPhysicianByEmail);
  const isAdmin = loggedInUser?.role === "admin";
  const isViewer = loggedInUser?.role === "viewer";
  const hasPhysicianProfile = Boolean(myProfile);
  const [requesterAssignmentId, setRequesterAssignmentId] = useState("");
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [targetPhysicianFilterId, setTargetPhysicianFilterId] = useState("");
  const [reason, setReason] = useState("");
  const [proposing, setProposing] = useState(false);
  const [resolvingAdminId, setResolvingAdminId] = useState<string | null>(null);

  const tradeOptions = useQuery(
    api.functions.tradeRequests.getTradeProposalOptions,
    hasPhysicianProfile ? {} : "skip",
  );
  const tradeCandidates = useQuery(
    api.functions.tradeRequests.getTradeCandidatesForAssignment,
    hasPhysicianProfile && requesterAssignmentId
      ? { requesterAssignmentId: requesterAssignmentId as any }
      : "skip",
  );
  const myTrades = useQuery(api.functions.tradeRequests.getMyTrades, hasPhysicianProfile ? {} : "skip");
  const adminTradeQueue = useQuery(
    api.functions.tradeRequests.getAdminTradeQueue,
    isAdmin ? {} : "skip",
  );

  const proposeTrade = useMutation(api.functions.tradeRequests.proposeTrade);
  const respondToTrade = useMutation(api.functions.tradeRequests.respondToTrade);
  const cancelTrade = useMutation(api.functions.tradeRequests.cancelTrade);
  const adminResolveTrade = useMutation(api.functions.tradeRequests.adminResolveTrade);
  const myAssignmentOptions = tradeOptions?.myAssignments ?? [];
  const availableAssignmentOptions = tradeOptions?.availableAssignments ?? [];
  const filteredAvailableAssignmentOptions = useMemo(() => {
    if (!targetPhysicianFilterId) return availableAssignmentOptions;
    return availableAssignmentOptions.filter(
      (assignment: any) => String(assignment.physicianId ?? "") === targetPhysicianFilterId,
    );
  }, [availableAssignmentOptions, targetPhysicianFilterId]);

  useEffect(() => {
    if (hasPhysicianProfile && myProfile && !myProfile.userId) {
      void linkCurrentUser({}).catch(() => undefined);
    }
  }, [hasPhysicianProfile, linkCurrentUser, myProfile?._id, myProfile?.userId]);

  useEffect(() => {
    if (!requesterAssignmentId && myAssignmentOptions.length > 0) {
      setRequesterAssignmentId(String(myAssignmentOptions[0].assignmentId));
    }
  }, [requesterAssignmentId, myAssignmentOptions]);

  useEffect(() => {
    if (!targetAssignmentId && availableAssignmentOptions.length > 0) {
      setTargetAssignmentId(String(availableAssignmentOptions[0].assignmentId));
    }
  }, [targetAssignmentId, availableAssignmentOptions]);

  useEffect(() => {
    setTargetPhysicianFilterId("");
  }, [requesterAssignmentId]);

  useEffect(() => {
    if (filteredAvailableAssignmentOptions.length === 0) {
      if (targetAssignmentId) setTargetAssignmentId("");
      return;
    }
    const selectedStillVisible = filteredAvailableAssignmentOptions.some(
      (assignment: any) => String(assignment.assignmentId) === targetAssignmentId,
    );
    if (!selectedStillVisible) {
      setTargetAssignmentId(String(filteredAvailableAssignmentOptions[0].assignmentId));
    }
  }, [filteredAvailableAssignmentOptions, targetAssignmentId]);

  if (
    loggedInUser === undefined ||
    myProfile === undefined ||
    (hasPhysicianProfile && tradeOptions === undefined) ||
    (hasPhysicianProfile && requesterAssignmentId && tradeCandidates === undefined) ||
    (hasPhysicianProfile && myTrades === undefined) ||
    (isAdmin && adminTradeQueue === undefined)
  ) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <p className="text-sm text-gray-600">Loading trades...</p>
      </div>
    );
  }

  const awaitingApprovalTrades = useMemo(
    () => (adminTradeQueue ?? []).filter((trade: any) => trade.status === "peer_accepted"),
    [adminTradeQueue],
  );

  const pendingPeerResponseTrades = useMemo(
    () => (adminTradeQueue ?? []).filter((trade: any) => trade.status === "proposed"),
    [adminTradeQueue],
  );

  const adminResolve = async (tradeRequestId: string, approve: boolean) => {
    setResolvingAdminId(tradeRequestId);
    try {
      await adminResolveTrade({
        tradeRequestId: tradeRequestId as any,
        approve,
      });
      toast.success(approve ? "Trade approved and swapped" : "Trade denied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve trade");
    } finally {
      setResolvingAdminId(null);
    }
  };

  if (!hasPhysicianProfile) {
    if (isViewer) {
      return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Viewer Access</h3>
          <p className="text-sm text-gray-700">
            Viewer accounts can review schedules on the dashboard but cannot propose or manage trades.
          </p>
        </div>
      );
    }

    if (isAdmin) {
      return (
        <div className="space-y-6">
          <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div>
              <h4 className="font-semibold">Admin Trade Queue</h4>
              <p className="text-sm text-gray-600">
                This admin account is not linked to a physician profile, so physician trade actions are hidden.
              </p>
            </div>
            <AdminApprovalTable
              title="Awaiting Approval"
              trades={awaitingApprovalTrades}
              resolvingAdminId={resolvingAdminId}
              onResolve={adminResolve}
              emptyMessage="No accepted trades awaiting approval."
            />
            <ReadOnlyTradeTable
              title="Pending Peer Response"
              trades={pendingPeerResponseTrades}
              emptyMessage="No trades currently waiting on physician response."
            />
          </section>
        </div>
      );
    }

    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Profile Not Linked</h3>
        <p className="text-sm text-gray-700">
          This authenticated account is not linked to a physician profile. Ask an admin to link your record.
        </p>
      </div>
    );
  }

  const myPhysicianId = String(myProfile!._id);
  const trades = myTrades ?? [];
  const incomingPendingTrades = trades.filter(
    (trade: any) => String(trade.targetPhysicianId) === myPhysicianId && trade.status === "proposed",
  );
  const outgoingPendingTrades = trades.filter(
    (trade: any) => String(trade.requestingPhysicianId) === myPhysicianId && trade.status === "proposed",
  );
  const acceptedTrades = trades.filter((trade: any) => trade.status === "peer_accepted");
  const approvedTrades = trades.filter((trade: any) => trade.status === "admin_approved");
  const closedTrades = trades.filter((trade: any) =>
    ["peer_declined", "admin_denied", "cancelled"].includes(trade.status),
  );

  const propose = async () => {
    if (!requesterAssignmentId || !targetAssignmentId) {
      toast.error("Select both your assignment and the target assignment");
      return;
    }

    setProposing(true);
    try {
      await proposeTrade({
        requesterAssignmentId: requesterAssignmentId as any,
        targetAssignmentId: targetAssignmentId as any,
        reason: reason.trim() || undefined,
      });
      toast.success("Trade request submitted (Pending)");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to propose trade");
    } finally {
      setProposing(false);
    }
  };

  const respond = async (tradeRequestId: string, decision: "accept" | "decline") => {
    try {
      await respondToTrade({
        tradeRequestId: tradeRequestId as any,
        decision,
      });
      toast.success(decision === "accept" ? "Trade moved to Accepted" : "Trade declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update trade");
    }
  };

  const cancel = async (tradeRequestId: string) => {
    try {
      await cancelTrade({
        tradeRequestId: tradeRequestId as any,
      });
      toast.success("Trade cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel trade");
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h3 className="text-lg font-semibold">3-Step Workflow</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StepChip label="1. Pending" className="bg-slate-100 text-slate-800" />
          <span className="text-gray-400">→</span>
          <StepChip label="2. Accepted" className="bg-cyan-100 text-cyan-800" />
          <span className="text-gray-400">→</span>
          <StepChip label="3. Approved" className="bg-emerald-100 text-emerald-800" />
        </div>
        <p className="text-sm text-gray-600">
          A physician requests a swap, the target physician accepts/declines, and admin approves to execute.
        </p>
      </section>

      {incomingPendingTrades.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="font-medium">Action Needed</div>
          <p className="text-sm mt-1">
            You have {incomingPendingTrades.length} pending trade request(s) to accept or decline.
          </p>
        </section>
      ) : null}

      <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h4 className="font-semibold">Step 1: Create Trade Request (Physician A)</h4>
        {!tradeOptions?.enabled ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {tradeOptions?.reason ?? "Trades are currently unavailable"}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-sm block">
              <span className="block text-xs text-gray-600 mb-1">Your Assignment</span>
              <select
                value={requesterAssignmentId}
                onChange={(event) => setRequesterAssignmentId(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                disabled={proposing}
              >
                {myAssignmentOptions.map((assignment: any) => (
                  <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                    {assignment.weekLabel} - {assignment.rotationLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm block">
              <span className="block text-xs text-gray-600 mb-1">Target Assignment You Want</span>
              {targetPhysicianFilterId ? (
                <div className="mb-1 flex items-center justify-between rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">
                  <span>Filtered to one suggested physician</span>
                  <button
                    className="underline hover:no-underline"
                    onClick={() => setTargetPhysicianFilterId("")}
                    type="button"
                  >
                    Clear filter
                  </button>
                </div>
              ) : null}
              <select
                value={targetAssignmentId}
                onChange={(event) => setTargetAssignmentId(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                disabled={proposing || filteredAvailableAssignmentOptions.length === 0}
              >
                {filteredAvailableAssignmentOptions.map((assignment: any) => (
                  <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                    {assignment.weekLabel} - {assignment.rotationLabel} ({assignment.physicianName})
                  </option>
                ))}
              </select>
              {filteredAvailableAssignmentOptions.length === 0 ? (
                <p className="mt-1 text-xs text-amber-800">
                  No assignments match the current physician filter.
                </p>
              ) : null}
            </label>

            <label className="text-sm block">
              <span className="block text-xs text-gray-600 mb-1">Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Why this swap is requested"
                disabled={proposing}
              />
            </label>

            <div className="flex justify-end">
              <button
                onClick={propose}
                disabled={proposing}
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {proposing ? "Submitting..." : "Submit Trade Request"}
              </button>
            </div>

            {tradeCandidates?.enabled ? (
              <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Who Is Available For Trade</div>
                    <div className="text-xs text-gray-600">
                      For {tradeCandidates.requesterAssignment?.weekLabel} •{" "}
                      {tradeCandidates.requesterAssignment?.rotationLabel}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Candidates: {tradeCandidates.suggestions?.length ?? 0}/
                    {tradeCandidates.totalCandidateCount ?? 0}
                  </div>
                </div>

                <div className="text-xs text-gray-600">
                  Excluded (hard): on service this week (
                  {tradeCandidates.excludedSummary?.alreadyOnServiceThisWeek ?? 0}), no request (
                  {tradeCandidates.excludedSummary?.missingScheduleRequest ?? 0}), missing rotation preference (
                  {tradeCandidates.excludedSummary?.missingRotationPreference ?? 0}), marked Do Not Assign (
                  {tradeCandidates.excludedSummary?.markedDoNotAssign ?? 0})
                </div>
                <div className="text-xs text-gray-600">
                  Continuity rule is soft: physicians off service both previous and following weeks stay visible but
                  are ranked lower.
                </div>

                {(tradeCandidates.suggestions ?? []).length === 0 ? (
                  <div className="text-xs text-amber-800">
                    No strong candidates found for this week/rotation under current constraints.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-auto border border-gray-200 rounded bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-2">Physician</th>
                          <th className="text-left px-2 py-2">Fit</th>
                          <th className="text-left px-2 py-2">Notes</th>
                          <th className="text-left px-2 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(tradeCandidates.suggestions ?? []).map((candidate: any) => (
                          <tr key={String(candidate.physicianId)} className="border-t border-gray-100 align-top">
                            <td className="px-2 py-2">
                              <div className="font-medium">
                                {candidate.physicianName} ({candidate.physicianInitials})
                              </div>
                              <a
                                href={`mailto:${candidate.physicianEmail}?subject=Trade request: ${tradeCandidates.requesterAssignment?.weekLabel ?? "service week"}&body=Hi ${candidate.physicianInitials}, would you be open to a trade for ${tradeCandidates.requesterAssignment?.weekLabel ?? "this week"} (${tradeCandidates.requesterAssignment?.rotationLabel ?? "rotation"})?`}
                                className="text-blue-700 hover:text-blue-800 underline"
                              >
                                {candidate.physicianEmail}
                              </a>
                            </td>
                            <td className="px-2 py-2">
                              <div>Score: {candidate.score}</div>
                              <div>{candidate.preferenceLabel}</div>
                              <div>
                                Prev: {candidate.hasServicePreviousWeek ? "On" : "Off"} | Next:{" "}
                                {candidate.hasServiceNextWeek ? "On" : "Off"}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-gray-700">
                              {(candidate.notes ?? []).slice(0, 2).join(" · ")}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                onClick={() => {
                                  const physicianId = String(candidate.physicianId);
                                  setTargetPhysicianFilterId(physicianId);
                                  const firstMatch = availableAssignmentOptions.find(
                                    (assignment: any) =>
                                      String(assignment.physicianId ?? "") === physicianId,
                                  );
                                  if (firstMatch) {
                                    setTargetAssignmentId(String(firstMatch.assignmentId));
                                  }
                                }}
                              >
                                Use for target
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-600">{tradeCandidates?.reason ?? null}</div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h4 className="font-semibold">Step 2: Pending / Accepted (Physician B Response)</h4>
        <TradeTable
          trades={[...incomingPendingTrades, ...outgoingPendingTrades, ...acceptedTrades]}
          myPhysicianId={myPhysicianId}
          onRespond={respond}
          onCancel={cancel}
          emptyMessage="No pending or accepted trades."
        />
      </section>

      {isAdmin ? (
        <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div>
            <h4 className="font-semibold">Step 3: Awaiting Approval (Admin)</h4>
            <p className="text-sm text-gray-600">
              Accepted trades appear here for final approval or denial.
            </p>
          </div>

          <AdminApprovalTable
            title="Awaiting Approval"
            trades={awaitingApprovalTrades}
            resolvingAdminId={resolvingAdminId}
            onResolve={adminResolve}
            emptyMessage="No accepted trades awaiting approval."
          />

          <ReadOnlyTradeTable
            title="Pending Peer Response"
            trades={pendingPeerResponseTrades}
            emptyMessage="No trades currently waiting on physician response."
          />
        </section>
      ) : null}

      <section className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <h4 className="font-semibold">Approved & Closed History</h4>
        <TradeTable
          trades={[...approvedTrades, ...closedTrades]}
          myPhysicianId={myPhysicianId}
          onRespond={respond}
          onCancel={cancel}
          emptyMessage="No approved or closed trades."
        />
      </section>
    </div>
  );
}

function TradeTable({
  trades,
  myPhysicianId,
  onRespond,
  onCancel,
  emptyMessage,
}: {
  trades: any[];
  myPhysicianId: string;
  onRespond: (tradeRequestId: string, decision: "accept" | "decline") => Promise<void>;
  onCancel: (tradeRequestId: string) => Promise<void>;
  emptyMessage: string;
}) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-3 py-2">Swap</th>
            <th className="text-left px-3 py-2">Workflow</th>
            <th className="text-left px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td className="px-3 py-3 text-gray-500" colSpan={3}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            trades.map((trade: any) => {
              const isTarget = String(trade.targetPhysicianId) === myPhysicianId;
              const isRequester = String(trade.requestingPhysicianId) === myPhysicianId;
              const workflowState = toWorkflowState(trade.status);

              return (
                <tr key={String(trade._id)} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      Give: {trade.requesterWeekLabel} ({trade.requesterRotationLabel})
                    </div>
                    <div className="font-medium">
                      Get: {trade.targetWeekLabel} ({trade.targetRotationLabel})
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {trade.requesterName} ↔ {trade.targetName}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StepChip label={workflowState} className={workflowClass(workflowState)} />
                    <div className="mt-1">
                      <StatusBadge status={trade.status} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {isTarget && trade.status === "proposed" ? (
                        <>
                          <button
                            onClick={() => {
                              void onRespond(String(trade._id), "accept");
                            }}
                            className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => {
                              void onRespond(String(trade._id), "decline");
                            }}
                            className="px-2 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700"
                          >
                            Decline
                          </button>
                        </>
                      ) : null}
                      {isRequester && (trade.status === "proposed" || trade.status === "peer_accepted") ? (
                        <button
                          onClick={() => {
                            void onCancel(String(trade._id));
                          }}
                          className="px-2 py-1 text-xs rounded bg-gray-600 text-white hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function AdminApprovalTable({
  title,
  trades,
  resolvingAdminId,
  onResolve,
  emptyMessage,
}: {
  title: string;
  trades: any[];
  resolvingAdminId: string | null;
  onResolve: (tradeRequestId: string, approve: boolean) => Promise<void>;
  emptyMessage: string;
}) {
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-gray-800">{title}</h5>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Trade</th>
              <th className="text-left px-3 py-2">State</th>
              <th className="text-left px-3 py-2">Admin Action</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={3}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              trades.map((trade: any) => {
                const isResolving = resolvingAdminId === String(trade._id);
                return (
                  <tr key={String(trade._id)} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{trade.requesterName} ↔ {trade.targetName}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Give: {trade.requesterWeekLabel} ({trade.requesterRotationLabel})
                      </div>
                      <div className="text-xs text-gray-600">
                        Get: {trade.targetWeekLabel} ({trade.targetRotationLabel})
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StepChip label="Accepted" className="bg-cyan-100 text-cyan-800" />
                      <div className="mt-1">
                        <StatusBadge status={trade.status} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            void onResolve(String(trade._id), true);
                          }}
                          disabled={isResolving}
                          className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            void onResolve(String(trade._id), false);
                          }}
                          disabled={isResolving}
                          className="px-2 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReadOnlyTradeTable({
  title,
  trades,
  emptyMessage,
}: {
  title: string;
  trades: any[];
  emptyMessage: string;
}) {
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-gray-800">{title}</h5>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Trade</th>
              <th className="text-left px-3 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={2}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              trades.map((trade: any) => (
                <tr key={String(trade._id)} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{trade.requesterName} ↔ {trade.targetName}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Give: {trade.requesterWeekLabel} ({trade.requesterRotationLabel})
                    </div>
                    <div className="text-xs text-gray-600">
                      Get: {trade.targetWeekLabel} ({trade.targetRotationLabel})
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StepChip label="Pending" className="bg-slate-100 text-slate-800" />
                    <div className="mt-1">
                      <StatusBadge status={trade.status} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toWorkflowState(status: string): string {
  if (status === "proposed") return "Pending";
  if (status === "peer_accepted") return "Accepted";
  if (status === "admin_approved") return "Approved";
  return "Closed";
}

function workflowClass(step: string): string {
  if (step === "Pending") return "bg-slate-100 text-slate-800";
  if (step === "Accepted") return "bg-cyan-100 text-cyan-800";
  if (step === "Approved") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

function StepChip({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${className}`}>{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    proposed: "bg-slate-100 text-slate-800",
    peer_accepted: "bg-cyan-100 text-cyan-800",
    peer_declined: "bg-rose-100 text-rose-800",
    admin_approved: "bg-emerald-100 text-emerald-800",
    admin_denied: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-700",
  };

  return (
    <span className={`inline-flex text-xs px-2 py-1 rounded font-medium ${classes[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}
