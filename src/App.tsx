import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { toast, Toaster } from "sonner";
import { useEffect, useMemo, useState } from "react";

type Availability = "green" | "yellow" | "red";

const availabilityOptions: Array<{ value: Availability; label: string }> = [
  { value: "green", label: "Green - OK to work" },
  { value: "yellow", label: "Yellow - Prefer not to" },
  { value: "red", label: "Red - Do not schedule" },
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <h2 className="text-xl font-semibold text-primary">Physician Scheduling</h2>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </header>
      <main className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-6xl mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">Physician Clinical Scheduling</h1>
        <Authenticated>
          <p className="text-xl text-secondary">Welcome back, {loggedInUser?.email ?? "friend"}!</p>
        </Authenticated>
        <Unauthenticated>
          <p className="text-xl text-secondary">Sign in to get started</p>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        <Dashboard />
      </Authenticated>
    </div>
  );
}

function Dashboard() {
  const myProfile = useQuery(api.functions.physicians.getMyProfile);
  const physicianCount = useQuery(api.functions.physicians.getPhysicianCount);
  const linkCurrentUser = useMutation(api.functions.physicians.linkCurrentUserToPhysicianByEmail);

  useEffect(() => {
    if (myProfile && !myProfile.userId) {
      void linkCurrentUser({}).catch(() => undefined);
    }
  }, [linkCurrentUser, myProfile?._id, myProfile?.userId]);

  const physicians = useQuery(api.functions.physicians.getPhysicians, myProfile ? {} : "skip");
  const fiscalYears = useQuery(api.functions.fiscalYears.getFiscalYears, myProfile ? {} : "skip");
  const currentFY = useQuery(api.functions.fiscalYears.getCurrentFiscalYear, myProfile ? {} : "skip");

  const myRequestBundle = useQuery(
    api.functions.scheduleRequests.getMyScheduleRequest,
    myProfile ? {} : "skip",
  );
  const currentWeekBundle = useQuery(
    api.functions.scheduleRequests.getCurrentFiscalYearWeeks,
    myProfile ? {} : "skip",
  );
  const adminRequestBundle = useQuery(
    api.functions.scheduleRequests.getAdminScheduleRequests,
    myProfile?.role === "admin" ? {} : "skip",
  );

  const tradeOptions = useQuery(
    api.functions.tradeRequests.getTradeProposalOptions,
    myProfile ? {} : "skip",
  );
  const myTrades = useQuery(api.functions.tradeRequests.getMyTrades, myProfile ? {} : "skip");
  const adminTradeQueue = useQuery(
    api.functions.tradeRequests.getAdminTradeQueue,
    myProfile?.role === "admin" ? {} : "skip",
  );

  if (
    myProfile === undefined ||
    physicianCount === undefined ||
    physicians === undefined ||
    fiscalYears === undefined ||
    currentFY === undefined ||
    myRequestBundle === undefined ||
    currentWeekBundle === undefined ||
    tradeOptions === undefined ||
    myTrades === undefined ||
    (myProfile?.role === "admin" && adminRequestBundle === undefined) ||
    (myProfile?.role === "admin" && adminTradeQueue === undefined)
  ) {
    return <div>Loading...</div>;
  }

  if (!myProfile) {
    if (physicianCount === 0) {
      return <BootstrapSetup />;
    }
    return <NoPhysicianProfile />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Physicians" value={String(physicians.length)} />
        <MetricCard label="Fiscal Years" value={String(fiscalYears.length)} />
        <MetricCard
          label="Current Cycle"
          value={currentFY ? currentFY.label : "Not set"}
          subValue={currentFY ? currentFY.status : "No active fiscal year"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <PhysicianRequestPanel
            myRequestBundle={myRequestBundle}
            currentWeekBundle={currentWeekBundle}
          />
          <TradePanel
            myPhysicianId={String(myProfile._id)}
            tradeOptions={tradeOptions}
            myTrades={myTrades}
          />
        </div>

        <div className="xl:col-span-2 space-y-6">
          {myProfile.role === "admin" ? <AdminRequestQueue adminRequestBundle={adminRequestBundle!} /> : null}
          {myProfile.role === "admin" ? <AdminTradeQueue trades={adminTradeQueue ?? []} /> : null}
          <AdminActions isAdmin={myProfile.role === "admin"} currentFY={currentFY} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subValue ? <p className="text-xs text-gray-500 mt-1">{subValue}</p> : null}
    </div>
  );
}

function PhysicianRequestPanel({
  myRequestBundle,
  currentWeekBundle,
}: {
  myRequestBundle: any;
  currentWeekBundle: any;
}) {
  const saveMyScheduleRequest = useMutation(api.functions.scheduleRequests.saveMyScheduleRequest);
  const setMyWeekPreference = useMutation(api.functions.scheduleRequests.setMyWeekPreference);
  const submitMyScheduleRequest = useMutation(api.functions.scheduleRequests.submitMyScheduleRequest);

  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [availability, setAvailability] = useState<Availability>("green");
  const [reasonText, setReasonText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSpecialRequests(myRequestBundle?.request?.specialRequests ?? "");
  }, [myRequestBundle?.request?._id, myRequestBundle?.request?.specialRequests]);

  useEffect(() => {
    if (!selectedWeekId && currentWeekBundle?.weeks?.length > 0) {
      setSelectedWeekId(String(currentWeekBundle.weeks[0]._id));
    }
  }, [currentWeekBundle?.weeks, selectedWeekId]);

  const preferenceByWeek = useMemo(() => {
    const map = new Map<string, any>();
    for (const preference of myRequestBundle?.weekPreferences ?? []) {
      map.set(String(preference.weekId), preference);
    }
    return map;
  }, [myRequestBundle?.weekPreferences]);

  const selectedPreference = selectedWeekId ? preferenceByWeek.get(selectedWeekId) : undefined;

  useEffect(() => {
    if (selectedPreference) {
      setAvailability(selectedPreference.availability);
      setReasonText(selectedPreference.reasonText ?? "");
    } else {
      setAvailability("green");
      setReasonText("");
    }
  }, [selectedWeekId, selectedPreference]);

  const canEdit = currentWeekBundle?.fiscalYear?.status === "collecting";

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await saveMyScheduleRequest({
        specialRequests: specialRequests.trim() || undefined,
      });
      toast.success("Special requests saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save request");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveWeekPreference = async () => {
    if (!selectedWeekId) {
      toast.error("Please select a week");
      return;
    }

    setSavingWeek(true);
    try {
      await setMyWeekPreference({
        weekId: selectedWeekId as any,
        availability,
        reasonText: reasonText.trim() || undefined,
      });
      toast.success("Week preference saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save week preference");
    } finally {
      setSavingWeek(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitMyScheduleRequest({});
      toast.success("Schedule request submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentWeekBundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Your Schedule Request</h3>
        <p className="text-sm text-gray-600">No fiscal year is configured yet.</p>
      </div>
    );
  }

  const requestStatus = myRequestBundle?.request?.status ?? "draft";
  const submittedAt = myRequestBundle?.request?.submittedAt;

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Your Schedule Request</h3>
          <p className="text-sm text-gray-600">
            {currentWeekBundle.fiscalYear.label} ({currentWeekBundle.fiscalYear.startDate} to {currentWeekBundle.fiscalYear.endDate})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={currentWeekBundle.fiscalYear.status} />
          <StatusBadge status={requestStatus} />
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Request editing is currently locked because fiscal year status is <b>{currentWeekBundle.fiscalYear.status}</b>.
        </div>
      ) : null}

      <section className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Special Requests</label>
        <textarea
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          disabled={!canEdit || savingNotes}
          placeholder="Additional context for scheduling committee..."
          className="w-full min-h-24 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {submittedAt ? `Last submitted: ${formatDateTime(submittedAt)}` : "Not submitted yet"}
          </p>
          <button
            onClick={handleSaveNotes}
            disabled={!canEdit || savingNotes}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingNotes ? "Saving..." : "Save Notes"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">Week Preferences</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Week</span>
            <select
              value={selectedWeekId}
              onChange={(e) => setSelectedWeekId(e.target.value)}
              disabled={!canEdit || savingWeek}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {(currentWeekBundle.weeks ?? []).map((week: any) => (
                <option key={String(week._id)} value={String(week._id)}>
                  Week {week.weekNumber}: {week.startDate} to {week.endDate}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Availability</span>
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value as Availability)}
              disabled={!canEdit || savingWeek}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {availabilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            <span className="block text-xs text-gray-600 mb-1">Reason Detail (optional)</span>
            <input
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              disabled={!canEdit || savingWeek}
              placeholder="Conference name, dates, etc."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveWeekPreference}
            disabled={!canEdit || savingWeek}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingWeek ? "Saving..." : "Save Week Preference"}
          </button>
        </div>

        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Week</th>
                <th className="text-left px-3 py-2">Availability</th>
                <th className="text-left px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {(myRequestBundle?.weekPreferences ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={3}>
                    No week preferences saved yet.
                  </td>
                </tr>
              ) : (
                (myRequestBundle.weekPreferences ?? []).map((preference: any) => (
                  <tr key={String(preference._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      Week {preference.week.weekNumber} ({preference.week.startDate} to {preference.week.endDate})
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={preference.availability} />
                    </td>
                    <td className="px-3 py-2 text-gray-700">{preference.reasonText ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canEdit || submitting}
          className="px-4 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

function TradePanel({
  myPhysicianId,
  tradeOptions,
  myTrades,
}: {
  myPhysicianId: string;
  tradeOptions: any;
  myTrades: any[];
}) {
  const proposeTrade = useMutation(api.functions.tradeRequests.proposeTrade);
  const respondToTrade = useMutation(api.functions.tradeRequests.respondToTrade);
  const cancelTrade = useMutation(api.functions.tradeRequests.cancelTrade);

  const [requesterAssignmentId, setRequesterAssignmentId] = useState("");
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!requesterAssignmentId && tradeOptions?.myAssignments?.length > 0) {
      setRequesterAssignmentId(String(tradeOptions.myAssignments[0].assignmentId));
    }
  }, [requesterAssignmentId, tradeOptions?.myAssignments]);

  useEffect(() => {
    if (!targetAssignmentId && tradeOptions?.availableAssignments?.length > 0) {
      setTargetAssignmentId(String(tradeOptions.availableAssignments[0].assignmentId));
    }
  }, [targetAssignmentId, tradeOptions?.availableAssignments]);

  const handlePropose = async () => {
    if (!requesterAssignmentId || !targetAssignmentId) {
      toast.error("Select both a give and receive assignment");
      return;
    }

    setSaving(true);
    try {
      await proposeTrade({
        requesterAssignmentId: requesterAssignmentId as any,
        targetAssignmentId: targetAssignmentId as any,
        reason: reason.trim() || undefined,
      });
      toast.success("Trade proposed");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to propose trade");
    } finally {
      setSaving(false);
    }
  };

  const handleRespond = async (tradeRequestId: string, decision: "accept" | "decline") => {
    try {
      await respondToTrade({
        tradeRequestId: tradeRequestId as any,
        decision,
      });
      toast.success(decision === "accept" ? "Trade accepted" : "Trade declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update trade");
    }
  };

  const handleCancel = async (tradeRequestId: string) => {
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
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Trades</h3>
        <p className="text-sm text-gray-600">One-for-one swaps after annual schedule publication.</p>
      </div>

      {!tradeOptions?.enabled ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {tradeOptions?.reason ?? "Trades are currently unavailable"}
        </div>
      ) : (
        <div className="space-y-3 border border-gray-200 rounded-md p-4">
          <h4 className="text-sm font-semibold text-gray-800">Propose Trade</h4>
          <label className="text-sm block">
            <span className="block text-xs text-gray-600 mb-1">Give Assignment</span>
            <select
              value={requesterAssignmentId}
              onChange={(e) => setRequesterAssignmentId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={saving}
            >
              {(tradeOptions?.myAssignments ?? []).map((assignment: any) => (
                <option key={String(assignment.assignmentId)} value={String(assignment.assignmentId)}>
                  {assignment.weekLabel} - {assignment.rotationLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm block">
            <span className="block text-xs text-gray-600 mb-1">Receive Assignment</span>
            <select
              value={targetAssignmentId}
              onChange={(e) => setTargetAssignmentId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={saving}
            >
              {(tradeOptions?.availableAssignments ?? []).map((assignment: any) => (
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
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Why do you need this swap?"
              disabled={saving}
            />
          </label>

          <div className="flex justify-end">
            <button
              onClick={handlePropose}
              disabled={saving}
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Submitting..." : "Propose Trade"}
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Swap</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(myTrades ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={3}>
                  No trade requests yet.
                </td>
              </tr>
            ) : (
              (myTrades ?? []).map((trade: any) => {
                const isTarget = String(trade.targetPhysicianId) === myPhysicianId;
                const isRequester = String(trade.requestingPhysicianId) === myPhysicianId;

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
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {isTarget && trade.status === "proposed" ? (
                          <>
                            <button
                              onClick={() => handleRespond(String(trade._id), "accept")}
                              className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRespond(String(trade._id), "decline")}
                              className="px-2 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700"
                            >
                              Decline
                            </button>
                          </>
                        ) : null}

                        {isRequester && (trade.status === "proposed" || trade.status === "peer_accepted") ? (
                          <button
                            onClick={() => handleCancel(String(trade._id))}
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
    </div>
  );
}

function AdminRequestQueue({ adminRequestBundle }: { adminRequestBundle: any }) {
  if (!adminRequestBundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Admin Queue</h3>
        <p className="text-sm text-gray-600">No fiscal year available yet.</p>
      </div>
    );
  }

  const counts = (adminRequestBundle.requests ?? []).reduce(
    (acc: Record<string, number>, request: any) => {
      acc[request.status] = (acc[request.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Admin Queue</h3>
        <p className="text-sm text-gray-600">{adminRequestBundle.fiscalYear.label} request submissions</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniMetric label="Draft" value={String(counts.draft ?? 0)} />
        <MiniMetric label="Submitted" value={String(counts.submitted ?? 0)} />
        <MiniMetric label="Revised" value={String(counts.revised ?? 0)} />
      </div>

      <div className="max-h-80 overflow-auto border rounded-md border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Physician</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Prefs</th>
            </tr>
          </thead>
          <tbody>
            {(adminRequestBundle.requests ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={3}>
                  No schedule requests yet.
                </td>
              </tr>
            ) : (
              (adminRequestBundle.requests ?? []).map((request: any) => (
                <tr key={String(request._id)} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{request.physicianName}</div>
                    <div className="text-xs text-gray-500">{request.physicianInitials}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={request.status} />
                    {request.submittedAt ? (
                      <div className="text-xs text-gray-500 mt-1">{formatDateTime(request.submittedAt)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{request.preferenceCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminTradeQueue({ trades }: { trades: any[] }) {
  const adminResolveTrade = useMutation(api.functions.tradeRequests.adminResolveTrade);

  const resolve = async (tradeRequestId: string, approve: boolean) => {
    try {
      await adminResolveTrade({
        tradeRequestId: tradeRequestId as any,
        approve,
      });
      toast.success(approve ? "Trade approved" : "Trade denied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve trade");
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Admin Trade Queue</h3>
        <p className="text-sm text-gray-600">Approve accepted trades and deny invalid requests.</p>
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Trade</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(trades ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={3}>
                  No trades awaiting admin review.
                </td>
              </tr>
            ) : (
              (trades ?? []).map((trade) => (
                <tr key={String(trade._id)} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{trade.requesterName} ↔ {trade.targetName}</div>
                    <div className="text-xs text-gray-600 mt-1">Give: {trade.requesterWeekLabel} ({trade.requesterRotationLabel})</div>
                    <div className="text-xs text-gray-600">Get: {trade.targetWeekLabel} ({trade.targetRotationLabel})</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={trade.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        disabled={trade.status !== "peer_accepted"}
                        onClick={() => resolve(String(trade._id), true)}
                        className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => resolve(String(trade._id), false)}
                        className="px-2 py-1 text-xs rounded bg-rose-600 text-white hover:bg-rose-700"
                      >
                        Deny
                      </button>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 p-2 bg-gray-50">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    admin: "bg-blue-100 text-blue-800",
    physician: "bg-green-100 text-green-800",
    setup: "bg-slate-100 text-slate-800",
    collecting: "bg-amber-100 text-amber-800",
    building: "bg-sky-100 text-sky-800",
    published: "bg-emerald-100 text-emerald-800",
    archived: "bg-gray-100 text-gray-700",
    green: "bg-emerald-100 text-emerald-800",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    draft: "bg-slate-100 text-slate-800",
    submitted: "bg-indigo-100 text-indigo-800",
    revised: "bg-orange-100 text-orange-800",
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

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function NoPhysicianProfile() {
  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
      <h3 className="text-lg font-semibold mb-2">Profile Not Linked</h3>
      <p className="text-sm text-gray-700">
        This account is authenticated but not linked to a physician profile. Sign in with your
        institutional email that exists in the physician roster, or ask an admin to create/link your record.
      </p>
    </div>
  );
}

function BootstrapSetup() {
  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
      <h3 className="text-lg font-semibold">Initial Setup</h3>
      <p className="text-sm text-gray-700">
        No physicians exist yet. Seed the physician roster first, then sign in as the seeded admin account
        to continue setup.
      </p>
      <SeedButton
        mutation={api.functions.physicians.seedPhysicians}
        label="Seed Physicians"
        description="Add initial physician roster"
      />
    </div>
  );
}

function AdminActions({ isAdmin, currentFY }: { isAdmin: boolean; currentFY: any }) {
  const updateFiscalYearStatus = useMutation(api.functions.fiscalYears.updateFiscalYearStatus);
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const nextStatusByCurrent: Record<string, string | undefined> = {
    setup: "collecting",
    collecting: "building",
    building: "published",
    published: "archived",
    archived: undefined,
  };

  useEffect(() => {
    if (!currentFY) {
      setTargetStatus("");
      return;
    }
    setTargetStatus(nextStatusByCurrent[currentFY.status] ?? currentFY.status);
  }, [currentFY?._id, currentFY?.status]);

  if (!isAdmin) {
    return (
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-lg font-semibold mb-2">Admin Actions</h3>
        <p className="text-sm text-gray-700">You do not have admin permissions.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-5">
      <h3 className="text-lg font-semibold mb-4">Admin Actions</h3>

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="font-medium text-sm">Fiscal Year Status</h4>
        {!currentFY ? (
          <p className="text-sm text-gray-600">No active fiscal year found.</p>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              <span className="text-gray-500">Current:</span> {currentFY.label} <StatusBadge status={currentFY.status} />
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                disabled={isUpdatingStatus}
              >
                <option value={currentFY.status}>{currentFY.status}</option>
                {nextStatusByCurrent[currentFY.status] ? (
                  <option value={nextStatusByCurrent[currentFY.status]}>
                    {nextStatusByCurrent[currentFY.status]}
                  </option>
                ) : null}
              </select>
              <button
                onClick={async () => {
                  if (!currentFY || !targetStatus || targetStatus === currentFY.status) {
                    return;
                  }
                  setIsUpdatingStatus(true);
                  try {
                    const result = await updateFiscalYearStatus({
                      fiscalYearId: currentFY._id,
                      status: targetStatus as any,
                    });
                    toast.success(result.message);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to update fiscal year status");
                  } finally {
                    setIsUpdatingStatus(false);
                  }
                }}
                disabled={!currentFY || !targetStatus || targetStatus === currentFY.status || isUpdatingStatus}
                className="px-3 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isUpdatingStatus ? "Updating..." : "Update Status"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SeedButton
          mutation={api.functions.physicians.seedPhysicians}
          label="Seed Physicians"
          description="Add 25 physicians to the database"
        />
        <SeedButton
          mutation={api.functions.fiscalYears.seedFY27}
          label="Create FY27"
          description="Create FY27 with 52 weeks"
        />
      </div>
    </div>
  );
}

function SeedButton({
  mutation,
  label,
  description,
}: {
  mutation: any;
  label: string;
  description: string;
}) {
  const runMutation = useMutation(mutation);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const response = await runMutation({});
      if (response && typeof response === "object" && "message" in response) {
        setResult(String(response.message));
      } else {
        setResult("Done");
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-medium mb-2">{label}</h4>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? "Loading..." : label}
      </button>
      {result && <p className="mt-2 text-sm text-gray-700">{result}</p>}
    </div>
  );
}
