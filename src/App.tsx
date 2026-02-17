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

const defaultClinicTypeNames = [
  "Pulmonary RAB",
  "Sleep Clinic",
  "CF Clinic",
  "Pulmonary South Loop",
  "Pulmonary Oak Park",
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
  const [adminPage, setAdminPage] = useState<
    | "overview"
    | "rotations"
    | "clinicTypes"
    | "cfteTargets"
    | "clinicAssignments"
    | "masterCalendar"
    | "auditLog"
  >("overview");
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
  const adminRotationsBundle = useQuery(
    api.functions.rotations.getCurrentFiscalYearRotations,
    myProfile?.role === "admin" ? {} : "skip",
  );
  const adminClinicTypesBundle = useQuery(
    api.functions.clinicTypes.getCurrentFiscalYearClinicTypes,
    myProfile?.role === "admin" ? {} : "skip",
  );
  const adminCfteTargetsBundle = useQuery(
    api.functions.cfteTargets.getCurrentFiscalYearCfteTargets,
    myProfile?.role === "admin" ? {} : "skip",
  );
  const adminClinicAssignmentsBundle = useQuery(
    api.functions.physicianClinics.getCurrentFiscalYearPhysicianClinics,
    myProfile?.role === "admin" ? {} : "skip",
  );
  const adminMasterCalendarBundle = useQuery(
    api.functions.masterCalendar.getCurrentFiscalYearMasterCalendarDraft,
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
    (myProfile?.role === "admin" && adminRotationsBundle === undefined) ||
    (myProfile?.role === "admin" && adminClinicTypesBundle === undefined) ||
    (myProfile?.role === "admin" && adminCfteTargetsBundle === undefined) ||
    (myProfile?.role === "admin" && adminClinicAssignmentsBundle === undefined) ||
    (myProfile?.role === "admin" && adminMasterCalendarBundle === undefined) ||
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

  const showAdminRotationsPage = myProfile.role === "admin" && adminPage === "rotations";
  const showAdminClinicTypesPage = myProfile.role === "admin" && adminPage === "clinicTypes";
  const showAdminCfteTargetsPage = myProfile.role === "admin" && adminPage === "cfteTargets";
  const showAdminClinicAssignmentsPage =
    myProfile.role === "admin" && adminPage === "clinicAssignments";
  const showAdminMasterCalendarPage = myProfile.role === "admin" && adminPage === "masterCalendar";
  const showAdminAuditLogPage = myProfile.role === "admin" && adminPage === "auditLog";

  return (
    <div className="space-y-6">
      {myProfile.role === "admin" ? (
        <div className="bg-white border border-gray-200 rounded-lg p-2 inline-flex gap-2">
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "overview" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("overview")}
          >
            Overview
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "rotations" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("rotations")}
          >
            Rotations
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "clinicTypes" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("clinicTypes")}
          >
            Clinic Types
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "cfteTargets" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("cfteTargets")}
          >
            cFTE Targets
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "clinicAssignments" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("clinicAssignments")}
          >
            Clinic Assignments
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "masterCalendar" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("masterCalendar")}
          >
            Master Calendar
          </button>
          <button
            className={`px-3 py-2 text-sm rounded ${adminPage === "auditLog" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            onClick={() => setAdminPage("auditLog")}
          >
            Audit Log
          </button>
        </div>
      ) : null}

      {showAdminRotationsPage ? (
        <AdminRotationsPage bundle={adminRotationsBundle} />
      ) : showAdminClinicTypesPage ? (
        <AdminClinicTypesPage bundle={adminClinicTypesBundle} />
      ) : showAdminCfteTargetsPage ? (
        <AdminCfteTargetsPage bundle={adminCfteTargetsBundle} />
      ) : showAdminClinicAssignmentsPage ? (
        <AdminClinicAssignmentsPage bundle={adminClinicAssignmentsBundle} />
      ) : showAdminMasterCalendarPage ? (
        <AdminMasterCalendarPage bundle={adminMasterCalendarBundle} />
      ) : showAdminAuditLogPage ? (
        <AdminAuditLogPage />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function AdminRotationsPage({ bundle }: { bundle: any }) {
  const createRotation = useMutation(api.functions.rotations.createRotation);
  const setRotationActive = useMutation(api.functions.rotations.setRotationActive);

  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [cftePerWeek, setCftePerWeek] = useState("0.02");
  const [minStaff, setMinStaff] = useState("1");
  const [maxConsecutiveWeeks, setMaxConsecutiveWeeks] = useState("2");
  const [isSaving, setIsSaving] = useState(false);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Rotations</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Manage Rotations</h3>
          <p className="text-sm text-gray-600">
            {bundle.fiscalYear.label} ({bundle.fiscalYear.status})
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="MICU 1"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Abbreviation</span>
            <input
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="MICU1"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">cFTE per week</span>
            <input
              type="number"
              step="0.001"
              value={cftePerWeek}
              onChange={(e) => setCftePerWeek(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Min staff</span>
            <input
              type="number"
              min="1"
              value={minStaff}
              onChange={(e) => setMinStaff(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="block text-xs text-gray-600 mb-1">Max consecutive weeks</span>
            <input
              type="number"
              min="1"
              value={maxConsecutiveWeeks}
              onChange={(e) => setMaxConsecutiveWeeks(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isSaving}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!name.trim() || !abbreviation.trim()) {
                toast.error("Name and abbreviation are required");
                return;
              }

              setIsSaving(true);
              try {
                const result = await createRotation({
                  name,
                  abbreviation,
                  cftePerWeek: Number(cftePerWeek),
                  minStaff: Number(minStaff),
                  maxConsecutiveWeeks: Number(maxConsecutiveWeeks),
                });
                toast.success(result.message);
                setName("");
                setAbbreviation("");
                setCftePerWeek("0.02");
                setMinStaff("1");
                setMaxConsecutiveWeeks("2");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create rotation");
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Add Rotation"}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="font-semibold mb-3">Current Rotations ({bundle.rotations.length})</h4>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Rotation</th>
                <th className="text-left px-3 py-2">cFTE</th>
                <th className="text-left px-3 py-2">Staffing</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {bundle.rotations.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={6}>
                    No rotations configured.
                  </td>
                </tr>
              ) : (
                bundle.rotations.map((rotation: any) => (
                  <tr key={String(rotation._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2">{rotation.sortOrder}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{rotation.name}</div>
                      <div className="text-xs text-gray-500">{rotation.abbreviation}</div>
                    </td>
                    <td className="px-3 py-2">{rotation.cftePerWeek}</td>
                    <td className="px-3 py-2">
                      min {rotation.minStaff}, max {rotation.maxConsecutiveWeeks} weeks
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={rotation.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={async () => {
                          try {
                            const result = await setRotationActive({
                              rotationId: rotation._id,
                              isActive: !rotation.isActive,
                            });
                            toast.success(result.message);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Failed to update rotation");
                          }
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-700 text-white hover:bg-gray-800"
                      >
                        {rotation.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminClinicTypesPage({ bundle }: { bundle: any }) {
  const createClinicType = useMutation(api.functions.clinicTypes.createClinicType);
  const setClinicTypeActive = useMutation(api.functions.clinicTypes.setClinicTypeActive);
  const [name, setName] = useState("");
  const [cftePerHalfDay, setCftePerHalfDay] = useState("0.005");
  const [isSaving, setIsSaving] = useState(false);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Clinic Types</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  const existingNames = new Set(
    (bundle.clinicTypes ?? []).map((clinicType: any) => clinicType.name.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Manage Clinic Types</h3>
          <p className="text-sm text-gray-600">
            {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - half-day clinic assignments (Mon-Fri)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Clinic Type Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Pulmonary RAB"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">cFTE per half-day</span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={cftePerHalfDay}
              onChange={(e) => setCftePerHalfDay(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              disabled={isSaving}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {defaultClinicTypeNames.map((clinicName) => (
            <button
              key={clinicName}
              disabled={isSaving || existingNames.has(clinicName.trim().toLowerCase())}
              onClick={async () => {
                setIsSaving(true);
                try {
                  const result = await createClinicType({
                    name: clinicName,
                    cftePerHalfDay: Number(cftePerHalfDay),
                  });
                  toast.success(`${clinicName}: ${result.message}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to add clinic type");
                } finally {
                  setIsSaving(false);
                }
              }}
              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {existingNames.has(clinicName.trim().toLowerCase()) ? `${clinicName} Added` : `Quick Add ${clinicName}`}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!name.trim()) {
                toast.error("Clinic type name is required");
                return;
              }
              if (Number(cftePerHalfDay) <= 0) {
                toast.error("cFTE per half-day must be greater than 0");
                return;
              }

              setIsSaving(true);
              try {
                const result = await createClinicType({
                  name,
                  cftePerHalfDay: Number(cftePerHalfDay),
                });
                toast.success(result.message);
                setName("");
                setCftePerHalfDay("0.005");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create clinic type");
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Add Clinic Type"}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="font-semibold mb-3">Current Clinic Types ({bundle.clinicTypes.length})</h4>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Clinic Type</th>
                <th className="text-left px-3 py-2">cFTE / Half-Day</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {bundle.clinicTypes.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={4}>
                    No clinic types configured.
                  </td>
                </tr>
              ) : (
                bundle.clinicTypes.map((clinicType: any) => (
                  <tr key={String(clinicType._id)} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{clinicType.name}</td>
                    <td className="px-3 py-2">{clinicType.cftePerHalfDay}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={clinicType.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={async () => {
                          try {
                            const result = await setClinicTypeActive({
                              clinicTypeId: clinicType._id,
                              isActive: !clinicType.isActive,
                            });
                            toast.success(result.message);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Failed to update clinic type");
                          }
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-700 text-white hover:bg-gray-800"
                      >
                        {clinicType.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminCfteTargetsPage({ bundle }: { bundle: any }) {
  const upsertTarget = useMutation(api.functions.cfteTargets.upsertCurrentFiscalYearCfteTarget);
  const [draftTargets, setDraftTargets] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!bundle?.targets) return;
    const next: Record<string, string> = {};
    for (const row of bundle.targets) {
      next[String(row.physicianId)] = row.targetCfte === null ? "" : String(row.targetCfte);
    }
    setDraftTargets(next);
  }, [bundle?.fiscalYear?._id, bundle?.targets]);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">cFTE Targets</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  const changedRows = (bundle.targets ?? []).filter((row: any) => {
    const draft = draftTargets[String(row.physicianId)] ?? "";
    const current = row.targetCfte === null ? "" : String(row.targetCfte);
    return draft !== current;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Physician cFTE Targets</h3>
            <p className="text-sm text-gray-600">
              {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - set annual target cFTE by physician
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = { ...draftTargets };
                for (const row of bundle.targets ?? []) {
                  next[String(row.physicianId)] = "0.60";
                }
                setDraftTargets(next);
              }}
              className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              disabled={isSaving}
            >
              Set All 0.60
            </button>
            <button
              onClick={async () => {
                if (changedRows.length === 0) {
                  toast.message("No cFTE target changes to save");
                  return;
                }

                setIsSaving(true);
                try {
                  for (const row of changedRows) {
                    const raw = (draftTargets[String(row.physicianId)] ?? "").trim();
                    if (!raw) {
                      throw new Error(`Missing target for ${row.physicianName}`);
                    }
                    const value = Number(raw);
                    if (!Number.isFinite(value)) {
                      throw new Error(`Invalid target for ${row.physicianName}`);
                    }
                    await upsertTarget({
                      physicianId: row.physicianId,
                      targetCfte: value,
                    });
                  }
                  toast.success(`Saved ${changedRows.length} target(s)`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to save cFTE targets");
                } finally {
                  setIsSaving(false);
                }
              }}
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : `Save Changes (${changedRows.length})`}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="border border-gray-200 rounded-md overflow-hidden max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Physician</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Target cFTE</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.targets ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={3}>
                    No active physicians found.
                  </td>
                </tr>
              ) : (
                (bundle.targets ?? []).map((row: any) => (
                  <tr key={String(row.physicianId)} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.physicianName}</div>
                      <div className="text-xs text-gray-500">{row.initials}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.role} />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={draftTargets[String(row.physicianId)] ?? ""}
                        onChange={(e) => {
                          setDraftTargets((prev) => ({
                            ...prev,
                            [String(row.physicianId)]: e.target.value,
                          }));
                        }}
                        disabled={isSaving}
                        className="w-28 rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminClinicAssignmentsPage({ bundle }: { bundle: any }) {
  const upsertAssignment = useMutation(api.functions.physicianClinics.upsertPhysicianClinicAssignment);
  const removeAssignment = useMutation(api.functions.physicianClinics.removePhysicianClinicAssignment);
  const [draft, setDraft] = useState<Record<string, { halfDaysPerWeek: string; activeWeeks: string }>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!bundle?.physicians || !bundle?.clinicTypes) return;
    const assignmentByKey = new Map(
      (bundle.assignments ?? []).map((assignment: any) => [
        `${String(assignment.physicianId)}:${String(assignment.clinicTypeId)}`,
        assignment,
      ]),
    );

    const next: Record<string, { halfDaysPerWeek: string; activeWeeks: string }> = {};
    for (const physician of bundle.physicians) {
      for (const clinicType of bundle.clinicTypes) {
        const key = `${String(physician._id)}:${String(clinicType._id)}`;
        const existing = assignmentByKey.get(key);
        next[key] = {
          halfDaysPerWeek: existing ? String(existing.halfDaysPerWeek) : "",
          activeWeeks: existing ? String(existing.activeWeeks) : "",
        };
      }
    }
    setDraft(next);
  }, [bundle?.fiscalYear?._id, bundle?.physicians, bundle?.clinicTypes, bundle?.assignments]);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Clinic Assignments</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  const assignmentByKey = new Map(
    (bundle.assignments ?? []).map((assignment: any) => [
      `${String(assignment.physicianId)}:${String(assignment.clinicTypeId)}`,
      assignment,
    ]),
  );

  const savePhysicianRow = async (physicianId: string) => {
    if (!bundle?.clinicTypes) return;

    setSavingRowId(physicianId);
    try {
      let changed = 0;
      for (const clinicType of bundle.clinicTypes) {
        const clinicTypeId = String(clinicType._id);
        const key = `${physicianId}:${clinicTypeId}`;
        const current = assignmentByKey.get(key);
        const target = draft[key] ?? { halfDaysPerWeek: "", activeWeeks: "" };
        const nextHalfDays = target.halfDaysPerWeek.trim() === "" ? 0 : Number(target.halfDaysPerWeek);
        const nextWeeks = target.activeWeeks.trim() === "" ? 0 : Number(target.activeWeeks);

        if (!Number.isInteger(nextHalfDays) || nextHalfDays < 0 || nextHalfDays > 10) {
          throw new Error(`Half-days/week must be an integer 0-10 for ${clinicType.name}`);
        }
        if (!Number.isInteger(nextWeeks) || nextWeeks < 0 || nextWeeks > 52) {
          throw new Error(`Active weeks must be an integer 0-52 for ${clinicType.name}`);
        }

        const currentHalfDays = current?.halfDaysPerWeek ?? 0;
        const currentWeeks = current?.activeWeeks ?? 0;
        const isChanged = currentHalfDays !== nextHalfDays || currentWeeks !== nextWeeks;
        if (!isChanged) continue;

        if (nextHalfDays === 0 || nextWeeks === 0) {
          await removeAssignment({
            physicianId: physicianId as any,
            clinicTypeId: clinicTypeId as any,
          });
          changed += 1;
          continue;
        }

        await upsertAssignment({
          physicianId: physicianId as any,
          clinicTypeId: clinicTypeId as any,
          halfDaysPerWeek: nextHalfDays,
          activeWeeks: nextWeeks,
        });
        changed += 1;
      }

      toast.success(changed > 0 ? `Saved ${changed} assignment change(s)` : "No assignment changes");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save clinic assignments");
    } finally {
      setSavingRowId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold">Physician Clinic Assignments</h3>
        <p className="text-sm text-gray-600">
          {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - half-days/week (0-10, Mon-Fri) and active
          weeks (0-52) per clinic
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="border border-gray-200 rounded-md overflow-auto max-h-[620px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-700 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 min-w-[190px]">Physician</th>
                {(bundle.clinicTypes ?? []).map((clinicType: any) => (
                  <th key={String(clinicType._id)} className="text-left px-2 py-2 min-w-[160px]">
                    <div className="font-medium">{clinicType.name}</div>
                    <div className="text-[11px] text-gray-500">{clinicType.cftePerHalfDay} cFTE/half-day</div>
                  </th>
                ))}
                <th className="text-left px-3 py-2 min-w-[110px]">Save</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.physicians ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={(bundle.clinicTypes?.length ?? 0) + 2}>
                    No active physicians found.
                  </td>
                </tr>
              ) : (
                (bundle.physicians ?? []).map((physician: any) => {
                  const physicianId = String(physician._id);
                  return (
                    <tr key={physicianId} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{physician.fullName}</div>
                        <div className="text-[11px] text-gray-500">{physician.initials}</div>
                      </td>
                      {(bundle.clinicTypes ?? []).map((clinicType: any) => {
                        const key = `${physicianId}:${String(clinicType._id)}`;
                        const cell = draft[key] ?? { halfDaysPerWeek: "", activeWeeks: "" };
                        return (
                          <td key={String(clinicType._id)} className="px-2 py-2">
                            <div className="space-y-1">
                              <input
                                type="number"
                                min="0"
                                max="10"
                                step="1"
                                placeholder="HD"
                                value={cell.halfDaysPerWeek}
                                disabled={savingRowId === physicianId}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...(prev[key] ?? { halfDaysPerWeek: "", activeWeeks: "" }),
                                      halfDaysPerWeek: e.target.value,
                                    },
                                  }))
                                }
                                className="w-16 rounded border border-gray-300 px-2 py-1"
                              />
                              <input
                                type="number"
                                min="0"
                                max="52"
                                step="1"
                                placeholder="Wk"
                                value={cell.activeWeeks}
                                disabled={savingRowId === physicianId}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...(prev[key] ?? { halfDaysPerWeek: "", activeWeeks: "" }),
                                      activeWeeks: e.target.value,
                                    },
                                  }))
                                }
                                className="w-16 rounded border border-gray-300 px-2 py-1"
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => {
                            void savePhysicianRow(physicianId);
                          }}
                          disabled={savingRowId !== null && savingRowId !== physicianId}
                          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingRowId === physicianId ? "Saving..." : "Save Row"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminMasterCalendarPage({ bundle }: { bundle: any }) {
  const createDraft = useMutation(api.functions.masterCalendar.createCurrentFiscalYearMasterCalendarDraft);
  const [isCreating, setIsCreating] = useState(false);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Master Calendar</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  const hasDraft = Boolean(bundle.calendar);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">Master Calendar Skeleton</h3>
            <p className="text-sm text-gray-600">
              {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - read-only grid to verify weeks and active
              rotations before assignment editing
            </p>
            {hasDraft ? (
              <p className="text-xs text-gray-500 mt-1">Draft v{bundle.calendar.version}</p>
            ) : null}
          </div>
          {!hasDraft ? (
            <button
              onClick={async () => {
                setIsCreating(true);
                try {
                  const result = await createDraft({});
                  toast.success(result.message);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to create draft");
                } finally {
                  setIsCreating(false);
                }
              }}
              disabled={isCreating}
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Draft Calendar"}
            </button>
          ) : null}
        </div>
      </div>

      {!hasDraft ? (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-sm text-gray-600">
          No draft calendar yet. Create one to review the week/rotation grid.
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="border border-gray-200 rounded-md overflow-auto max-h-[640px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-700 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 min-w-[150px]">Week</th>
                  {(bundle.rotations ?? []).map((rotation: any) => (
                    <th key={String(rotation._id)} className="text-left px-3 py-2 min-w-[120px]">
                      <div className="font-medium">{rotation.name}</div>
                      <div className="text-[11px] text-gray-500">{rotation.abbreviation}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(bundle.grid ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={(bundle.rotations?.length ?? 0) + 1}>
                      No week/rotation cells available. Configure weeks and active rotations.
                    </td>
                  </tr>
                ) : (
                  (bundle.grid ?? []).map((row: any) => (
                    <tr key={String(row.weekId)} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-medium">Week {row.weekNumber}</div>
                        <div className="text-[11px] text-gray-500">
                          {row.startDate} to {row.endDate}
                        </div>
                      </td>
                      {(row.cells ?? []).map((cell: any, index: number) => (
                        <td key={`${String(row.weekId)}:${index}`} className="px-3 py-2">
                          {cell.physicianId ? (
                            <span className="text-gray-700">Assigned</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminAuditLogPage() {
  const [cursor, setCursor] = useState("0");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [draftActionFilter, setDraftActionFilter] = useState("");
  const [draftEntityFilter, setDraftEntityFilter] = useState("");
  const [appliedActionFilter, setAppliedActionFilter] = useState("");
  const [appliedEntityFilter, setAppliedEntityFilter] = useState("");

  const bundle = useQuery(api.functions.auditLog.getCurrentFiscalYearAuditLog, {
    cursor,
    limit: 25,
    actionFilter: appliedActionFilter.trim() || undefined,
    entityTypeFilter: appliedEntityFilter.trim() || undefined,
  });

  if (bundle === undefined) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <p className="text-sm text-gray-600">Loading audit log...</p>
      </div>
    );
  }

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Audit Log</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Audit Log</h3>
          <p className="text-sm text-gray-600">
            {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - key events such as status transitions,
            schedule submissions, and trade actions
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Action contains</span>
            <input
              value={draftActionFilter}
              onChange={(e) => setDraftActionFilter(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="trade, submitted, status"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Entity contains</span>
            <input
              value={draftEntityFilter}
              onChange={(e) => setDraftEntityFilter(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="scheduleRequest"
            />
          </label>
          <button
            onClick={() => {
              setAppliedActionFilter(draftActionFilter);
              setAppliedEntityFilter(draftEntityFilter);
              setCursor("0");
              setCursorHistory([]);
            }}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Apply Filters
          </button>
          <button
            onClick={() => {
              setDraftActionFilter("");
              setDraftEntityFilter("");
              setAppliedActionFilter("");
              setAppliedEntityFilter("");
              setCursor("0");
              setCursorHistory([]);
            }}
            className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div className="text-sm text-gray-600">Total matching entries: {bundle.totalCount}</div>
        <div className="border border-gray-200 rounded-md overflow-auto max-h-[620px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Entity</th>
                <th className="text-left px-3 py-2">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.items ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={5}>
                    No audit entries found for this filter.
                  </td>
                </tr>
              ) : (
                (bundle.items ?? []).map((item: any) => (
                  <tr key={String(item._id)} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(item.timestamp)}</td>
                    <td className="px-3 py-2">{item.userName}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">{item.entityType}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.entityId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              if (cursorHistory.length === 0) return;
              const previous = cursorHistory[cursorHistory.length - 1];
              setCursorHistory((prev) => prev.slice(0, -1));
              setCursor(previous);
            }}
            disabled={cursorHistory.length === 0}
            className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => {
              if (!bundle.nextCursor) return;
              setCursorHistory((prev) => [...prev, cursor]);
              setCursor(bundle.nextCursor);
            }}
            disabled={!bundle.nextCursor}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Next
          </button>
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
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-gray-100 text-gray-700",
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
