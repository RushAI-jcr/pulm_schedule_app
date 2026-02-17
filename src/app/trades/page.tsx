"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignInForm } from "../../SignInForm";
import { SignOutButton } from "../../SignOutButton";
import { toast, Toaster } from "sonner";
import { useEffect, useMemo, useState } from "react";

export default function TradesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-primary">Trades & Swaps</h2>
          <Link href="/" className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200">
            Back to Dashboard
          </Link>
        </div>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </header>
      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-6xl mx-auto">
          <Unauthenticated>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4 max-w-md mx-auto">
              <h3 className="text-lg font-semibold">Sign in to manage trades</h3>
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
  const myProfile = useQuery(api.functions.physicians.getMyProfile);
  const linkCurrentUser = useMutation(api.functions.physicians.linkCurrentUserToPhysicianByEmail);

  const tradeOptions = useQuery(
    api.functions.tradeRequests.getTradeProposalOptions,
    myProfile ? {} : "skip",
  );
  const myTrades = useQuery(api.functions.tradeRequests.getMyTrades, myProfile ? {} : "skip");
  const adminTradeQueue = useQuery(
    api.functions.tradeRequests.getAdminTradeQueue,
    myProfile?.role === "admin" ? {} : "skip",
  );

  const proposeTrade = useMutation(api.functions.tradeRequests.proposeTrade);
  const respondToTrade = useMutation(api.functions.tradeRequests.respondToTrade);
  const cancelTrade = useMutation(api.functions.tradeRequests.cancelTrade);
  const adminResolveTrade = useMutation(api.functions.tradeRequests.adminResolveTrade);

  const [requesterAssignmentId, setRequesterAssignmentId] = useState("");
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [reason, setReason] = useState("");
  const [proposing, setProposing] = useState(false);
  const [resolvingAdminId, setResolvingAdminId] = useState<string | null>(null);
  const myAssignmentOptions = tradeOptions?.myAssignments ?? [];
  const availableAssignmentOptions = tradeOptions?.availableAssignments ?? [];

  useEffect(() => {
    if (myProfile && !myProfile.userId) {
      void linkCurrentUser({}).catch(() => undefined);
    }
  }, [linkCurrentUser, myProfile?._id, myProfile?.userId]);

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

  if (
    myProfile === undefined ||
    (myProfile && tradeOptions === undefined) ||
    (myProfile && myTrades === undefined) ||
    (myProfile?.role === "admin" && adminTradeQueue === undefined)
  ) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <p className="text-sm text-gray-600">Loading trades...</p>
      </div>
    );
  }

  if (!myProfile) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Profile Not Linked</h3>
        <p className="text-sm text-gray-700">
          This authenticated account is not linked to a physician profile. Ask an admin to link your record.
        </p>
      </div>
    );
  }

  const myPhysicianId = String(myProfile._id);
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

  const awaitingApprovalTrades = useMemo(
    () => (adminTradeQueue ?? []).filter((trade: any) => trade.status === "peer_accepted"),
    [adminTradeQueue],
  );

  const pendingPeerResponseTrades = useMemo(
    () => (adminTradeQueue ?? []).filter((trade: any) => trade.status === "proposed"),
    [adminTradeQueue],
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
              <select
                value={targetAssignmentId}
                onChange={(event) => setTargetAssignmentId(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                disabled={proposing}
              >
                {availableAssignmentOptions.map((assignment: any) => (
                  <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                    {assignment.weekLabel} - {assignment.rotationLabel} ({assignment.physicianName})
                  </option>
                ))}
              </select>
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

      {myProfile.role === "admin" ? (
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
