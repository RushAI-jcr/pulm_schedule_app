"use client";

import { Authenticated, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/data/convex";
import { SignInForm } from "@/features/auth/components/SignInForm";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle";
import { toast, Toaster } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { Availability, AvailabilityOption } from "@/shared/types";
import { availabilityOptions, defaultClinicTypeNames } from "@/shared/constants";
import {
  buildMasterCalendarAssignmentCsv,
  buildMasterCalendarExportXlsxBytes,
  buildMasterCalendarIcs,
  MasterCalendarExportData,
} from "@/shared/services/masterCalendarExport";
import {
  ParsedUploadPayload,
  UploadAvailability,
  doesDoctorTokenMatch,
  normalizeFiscalYearLabel,
  parseScheduleImportFile,
} from "@/shared/services/scheduleImport";

type ImportTargetPhysician = {
  _id: string;
  firstName: string;
  lastName: string;
  initials: string;
};

type FiscalWeekLite = {
  startDate: string;
};

function validateParsedUpload(params: {
  payload: ParsedUploadPayload | null;
  fiscalYearLabel: string | null | undefined;
  targetPhysician: ImportTargetPhysician | null;
  fiscalWeeks: FiscalWeekLite[];
}): string | null {
  const { payload, fiscalYearLabel, targetPhysician, fiscalWeeks } = params;
  if (!payload || !fiscalYearLabel || !targetPhysician) {
    return null;
  }

  const parsedFy = normalizeFiscalYearLabel(payload.sourceFiscalYearLabel);
  const activeFy = normalizeFiscalYearLabel(fiscalYearLabel);
  if (parsedFy !== activeFy) {
    return `File fiscal year ${parsedFy} does not match active fiscal year ${activeFy}.`;
  }

  if (
    !doesDoctorTokenMatch(payload.sourceDoctorToken, {
      lastName: targetPhysician.lastName,
      initials: targetPhysician.initials,
    })
  ) {
    return `File doctor token ${payload.sourceDoctorToken} does not match ${targetPhysician.lastName} (${targetPhysician.initials}).`;
  }

  const expectedWeekStarts = fiscalWeeks.map((week) => week.startDate);
  const uploadedWeekStarts = payload.weeks.map((week) => week.weekStart);
  if (expectedWeekStarts.length !== uploadedWeekStarts.length) {
    return `File must include exactly ${expectedWeekStarts.length} weeks; found ${uploadedWeekStarts.length}.`;
  }

  const expectedSet = new Set(expectedWeekStarts);
  const uploadedSet = new Set(uploadedWeekStarts);

  const unknown = uploadedWeekStarts.filter((weekStart) => !expectedSet.has(weekStart));
  if (unknown.length > 0) {
    return `File contains unknown week_start values: ${Array.from(new Set(unknown)).slice(0, 3).join(", ")}`;
  }

  const missing = expectedWeekStarts.filter((weekStart) => !uploadedSet.has(weekStart));
  if (missing.length > 0) {
    return `File is missing week_start values: ${missing.slice(0, 3).join(", ")}`;
  }

  return null;
}

function downloadBlobFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/85">
        <h2 className="text-base font-semibold text-primary md:text-lg">Rush PCCM Calendar Assistant</h2>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Authenticated>
            <SignOutButton />
          </Authenticated>
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center p-6 md:p-8">
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
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
          Rush PCCM Calendar Assistant
        </h1>
        <Authenticated>
          <p className="text-xl text-secondary dark:text-slate-200">
            Welcome back, {loggedInUser?.email ?? "friend"}!
          </p>
        </Authenticated>
        <Unauthenticated>
          <p className="text-xl text-secondary dark:text-slate-200">Sign in to get started</p>
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
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const myProfile = useQuery(api.functions.physicians.getMyProfile);
  const physicianCount = useQuery(api.functions.physicians.getPhysicianCount);
  const linkCurrentUser = useMutation(api.functions.physicians.linkCurrentUserToPhysicianByEmail);
  const isAdmin = loggedInUser?.role === "admin";
  const isViewer = loggedInUser?.role === "viewer";
  const hasPhysicianProfile = Boolean(myProfile);

  useEffect(() => {
    if (hasPhysicianProfile && myProfile && !myProfile.userId) {
      void linkCurrentUser({}).catch(() => undefined);
    }
  }, [hasPhysicianProfile, linkCurrentUser, myProfile?._id, myProfile?.userId]);

  const physicians = useQuery(api.functions.physicians.getPhysicians, loggedInUser ? {} : "skip");
  const fiscalYears = useQuery(api.functions.fiscalYears.getFiscalYears, loggedInUser ? {} : "skip");
  const currentFY = useQuery(api.functions.fiscalYears.getCurrentFiscalYear, loggedInUser ? {} : "skip");

  const myRequestBundle = useQuery(
    api.functions.scheduleRequests.getMyScheduleRequest,
    hasPhysicianProfile ? {} : "skip",
  );
  const myRotationPreferenceBundle = useQuery(
    api.functions.rotationPreferences.getMyRotationPreferences,
    hasPhysicianProfile ? {} : "skip",
  );
  const currentWeekBundle = useQuery(
    api.functions.scheduleRequests.getCurrentFiscalYearWeeks,
    loggedInUser ? {} : "skip",
  );
  const adminRequestBundle = useQuery(
    api.functions.scheduleRequests.getAdminScheduleRequests,
    isAdmin ? {} : "skip",
  );

  const tradeOptions = useQuery(
    api.functions.tradeRequests.getTradeProposalOptions,
    hasPhysicianProfile ? {} : "skip",
  );
  const myTrades = useQuery(api.functions.tradeRequests.getMyTrades, hasPhysicianProfile ? {} : "skip");
  const adminTradeQueue = useQuery(
    api.functions.tradeRequests.getAdminTradeQueue,
    isAdmin ? {} : "skip",
  );
  const adminRotationsBundle = useQuery(
    api.functions.rotations.getCurrentFiscalYearRotations,
    isAdmin ? {} : "skip",
  );
  const adminClinicTypesBundle = useQuery(
    api.functions.clinicTypes.getCurrentFiscalYearClinicTypes,
    isAdmin ? {} : "skip",
  );
  const adminCfteTargetsBundle = useQuery(
    api.functions.cfteTargets.getCurrentFiscalYearCfteTargets,
    isAdmin ? {} : "skip",
  );
  const adminClinicAssignmentsBundle = useQuery(
    api.functions.physicianClinics.getCurrentFiscalYearPhysicianClinics,
    isAdmin ? {} : "skip",
  );
  const adminMasterCalendarBundle = useQuery(
    api.functions.masterCalendar.getCurrentFiscalYearMasterCalendarDraft,
    isAdmin ? {} : "skip",
  );
  const publishedMasterCalendarBundle = useQuery(
    api.functions.masterCalendar.getCurrentFiscalYearPublishedMasterCalendar,
    loggedInUser ? {} : "skip",
  );
  const adminRotationPreferenceBundle = useQuery(
    api.functions.rotationPreferences.getAdminRotationPreferenceMatrix,
    isAdmin ? {} : "skip",
  );

  if (
    loggedInUser === undefined ||
    myProfile === undefined ||
    physicianCount === undefined ||
    physicians === undefined ||
    fiscalYears === undefined ||
    currentFY === undefined ||
    (loggedInUser && publishedMasterCalendarBundle === undefined) ||
    currentWeekBundle === undefined ||
    (hasPhysicianProfile && myRequestBundle === undefined) ||
    (hasPhysicianProfile && myRotationPreferenceBundle === undefined) ||
    (hasPhysicianProfile && tradeOptions === undefined) ||
    (hasPhysicianProfile && myTrades === undefined) ||
    (isAdmin && adminRotationsBundle === undefined) ||
    (isAdmin && adminClinicTypesBundle === undefined) ||
    (isAdmin && adminCfteTargetsBundle === undefined) ||
    (isAdmin && adminClinicAssignmentsBundle === undefined) ||
    (isAdmin && adminMasterCalendarBundle === undefined) ||
    (isAdmin && adminRotationPreferenceBundle === undefined) ||
    (isAdmin && adminRequestBundle === undefined) ||
    (isAdmin && adminTradeQueue === undefined)
  ) {
    return <div>Loading...</div>;
  }

  if (isViewer) {
    return (
      <ViewerDashboard
        physicians={physicians}
        fiscalYears={fiscalYears}
        currentFY={currentFY}
        publishedMasterCalendarBundle={publishedMasterCalendarBundle}
      />
    );
  }

  if (!hasPhysicianProfile && !isAdmin) {
    if (physicianCount === 0) {
      return <BootstrapSetup />;
    }
    return <NoPhysicianProfile />;
  }

  const showAdminRotationsPage = isAdmin && adminPage === "rotations";
  const showAdminClinicTypesPage = isAdmin && adminPage === "clinicTypes";
  const showAdminCfteTargetsPage = isAdmin && adminPage === "cfteTargets";
  const showAdminClinicAssignmentsPage = isAdmin && adminPage === "clinicAssignments";
  const showAdminMasterCalendarPage = isAdmin && adminPage === "masterCalendar";
  const showAdminAuditLogPage = isAdmin && adminPage === "auditLog";

  return (
    <div className="space-y-6">
      {isAdmin ? (
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
              {hasPhysicianProfile ? (
                <>
                  <PhysicianRequestPanel
                    myRequestBundle={myRequestBundle}
                    myRotationPreferenceBundle={myRotationPreferenceBundle}
                    currentWeekBundle={currentWeekBundle}
                    myProfile={myProfile}
                  />
                  <TradePanel
                    myPhysicianId={String(myProfile!._id)}
                    tradeOptions={tradeOptions}
                    myTrades={myTrades ?? []}
                  />
                </>
              ) : (
                <AdminNoPhysicianProfileNotice />
              )}
            </div>

            <div className="xl:col-span-2 space-y-6">
              {isAdmin ? (
                <AdminWeekPreferenceImportPanel
                  physicians={physicians}
                  currentWeekBundle={currentWeekBundle}
                />
              ) : null}
              {isAdmin ? <AdminRequestQueue adminRequestBundle={adminRequestBundle!} /> : null}
              {isAdmin ? <AdminTradeQueue trades={adminTradeQueue ?? []} /> : null}
              {isAdmin ? (
                <AdminRotationPreferencePanel bundle={adminRotationPreferenceBundle} />
              ) : null}
              <AdminActions isAdmin={isAdmin} currentFY={currentFY} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ViewerDashboard({
  physicians,
  fiscalYears,
  currentFY,
  publishedMasterCalendarBundle,
}: {
  physicians: any[];
  fiscalYears: any[];
  currentFY: any;
  publishedMasterCalendarBundle: any;
}) {
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
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-lg font-semibold mb-2">Viewer Access</h3>
        <p className="text-sm text-gray-700">
          This account is in read-only mode. Scheduling requests, trades, and admin configuration are disabled.
        </p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-lg font-semibold mb-2">Master Calendar (Read-only)</h3>
        {!publishedMasterCalendarBundle?.fiscalYear ? (
          <p className="text-sm text-gray-700">No active fiscal year is configured.</p>
        ) : !publishedMasterCalendarBundle?.calendar ? (
          <p className="text-sm text-gray-700">
            No published master calendar is available for {publishedMasterCalendarBundle.fiscalYear.label}.
          </p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Week</th>
                  {(publishedMasterCalendarBundle.rotations ?? []).map((rotation: any) => (
                    <th key={String(rotation._id)} className="text-left px-3 py-2">
                      <div className="font-medium">{rotation.abbreviation}</div>
                      <div className="text-[11px] text-gray-500">{rotation.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(publishedMasterCalendarBundle.grid ?? []).map((row: any) => (
                  <tr key={String(row.weekId)} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-medium">W{row.weekNumber}</div>
                      <div className="text-[11px] text-gray-500">
                        {row.startDate} to {row.endDate}
                      </div>
                    </td>
                    {(row.cells ?? []).map((cell: any) => (
                      <td key={String(cell.rotationId)} className="px-3 py-2">
                        <div className="font-medium">{cell.physicianInitials ?? "--"}</div>
                        <div className="text-[11px] text-gray-500">{cell.physicianName ?? "Unassigned"}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminNoPhysicianProfileNotice() {
  return (
    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
      <h3 className="text-lg font-semibold mb-2">Admin Access (No Physician Profile)</h3>
      <p className="text-sm text-gray-700">
        This admin account is not linked to a physician profile. Physician self-service workflows are hidden,
        but admin controls remain available.
      </p>
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
          <p className="text-xs text-gray-500 mt-1">
            Canonical inpatient rotations: Pulm, MICU 1, MICU 2, AICU, LTAC, ROPH, IP, PFT
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Pulm"
              disabled={isSaving}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Abbreviation</span>
            <input
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="PULM"
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
    const assignmentByKey = new Map<string, any>(
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

  const assignmentByKey = new Map<string, any>(
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
  const autoAssign = useMutation(api.functions.masterCalendar.autoAssignCurrentFiscalYearDraft);
  const assignDraftCell = useMutation(api.functions.masterCalendar.assignCurrentFiscalYearDraftCell);
  const calendarEventsBundle = useQuery(api.functions.calendarEvents.getCurrentFiscalYearCalendarEvents, {});
  const [isCreating, setIsCreating] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [assigningCellKey, setAssigningCellKey] = useState<string | null>(null);
  const [draggingPayload, setDraggingPayload] = useState<{ physicianId: string; weekId: string } | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<"csv" | "xlsx" | "ics" | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Master Calendar</h3>
        <p className="text-sm text-gray-600">No active fiscal year found. Create/activate a fiscal year first.</p>
      </div>
    );
  }

  const hasDraft = Boolean(bundle.calendar);
  const physicians = bundle.physicians ?? [];
  const weeks = bundle.weeks ?? [];
  const rotations = bundle.rotations ?? [];

  const physicianById = useMemo(() => {
    return new Map<string, any>(
      physicians.map((physician: any) => [String(physician._id), physician]),
    );
  }, [physicians]);

  const availabilityByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of bundle.availabilityEntries ?? []) {
      map.set(`${String(entry.physicianId)}:${String(entry.weekId)}`, entry.availability);
    }
    return map;
  }, [bundle.availabilityEntries]);

  const cfteByPhysicianId = useMemo(() => {
    return new Map<string, any>(
      (bundle.cfteSummary ?? []).map((row: any) => [String(row.physicianId), row]),
    );
  }, [bundle.cfteSummary]);

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (exportMenuRef.current?.contains(target)) return;
      setIsExportMenuOpen(false);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [isExportMenuOpen]);

  const getAvailabilityClasses = (availability: string) => {
    if (availability === "green") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (availability === "red") return "bg-rose-100 text-rose-800 border-rose-200";
    return "bg-amber-100 text-amber-800 border-amber-200";
  };

  const assignToCell = async (weekId: string, rotationId: string, physicianId: string | null) => {
    const cellKey = `${weekId}:${rotationId}`;
    setAssigningCellKey(cellKey);
    try {
      const result = await assignDraftCell({
        weekId: weekId as any,
        rotationId: rotationId as any,
        physicianId: physicianId ? (physicianId as any) : undefined,
      });
      if ((result.warnings ?? []).length > 0) {
        for (const warning of result.warnings) {
          toast.warning(String(warning));
        }
      }
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save assignment");
    } finally {
      setAssigningCellKey(null);
    }
  };

  const buildExportData = (): MasterCalendarExportData => {
    const weekById = new Map<string, any>(weeks.map((week: any) => [String(week._id), week]));
    const rotationById = new Map<string, any>(
      rotations.map((rotation: any) => [String(rotation._id), rotation]),
    );
    const physicianById = new Map<string, any>(
      physicians.map((physician: any) => [String(physician._id), physician]),
    );

    const assignments = [];
    for (const row of bundle.grid ?? []) {
      const weekId = String(row.weekId);
      const week = weekById.get(weekId);
      if (!week) continue;

      for (const cell of row.cells ?? []) {
        const physicianId = cell.physicianId ? String(cell.physicianId) : null;
        if (!physicianId) continue;

        const physician = physicianById.get(physicianId);
        const rotation = rotationById.get(String(cell.rotationId));
        if (!physician || !rotation) continue;

        assignments.push({
          physicianId,
          physicianName: String(physician.fullName),
          physicianInitials: String(physician.initials),
          weekId,
          weekNumber: Number(week.weekNumber),
          weekStartDate: String(week.startDate),
          weekEndDate: String(week.endDate),
          rotationId: String(rotation._id),
          rotationName: String(rotation.name),
          rotationAbbreviation: rotation.abbreviation ? String(rotation.abbreviation) : "",
        });
      }
    }

    const calendarEvents = (calendarEventsBundle?.events ?? []).map((event: any) => {
      const week = event.weekId ? weekById.get(String(event.weekId)) : null;
      return {
        id: String(event._id),
        weekId: event.weekId ? String(event.weekId) : null,
        weekNumber: week ? Number(week.weekNumber) : null,
        date: String(event.date),
        name: String(event.name),
        category: String(event.category),
        source: event.source ? String(event.source) : null,
        isApproved: typeof event.isApproved === "boolean" ? event.isApproved : null,
        isVisible: typeof event.isVisible === "boolean" ? event.isVisible : null,
      };
    });

    return {
      fiscalYearLabel: String(bundle.fiscalYear?.label ?? "fiscal-year"),
      generatedAtMs: Date.now(),
      physicians: physicians.map((physician: any) => ({
        id: String(physician._id),
        fullName: String(physician.fullName),
        initials: String(physician.initials),
      })),
      weeks: weeks.map((week: any) => ({
        id: String(week._id),
        weekNumber: Number(week.weekNumber),
        startDate: String(week.startDate),
        endDate: String(week.endDate),
      })),
      rotations: rotations.map((rotation: any) => ({
        id: String(rotation._id),
        name: String(rotation.name),
        abbreviation: rotation.abbreviation ? String(rotation.abbreviation) : "",
      })),
      assignments,
      calendarEvents,
    };
  };

  const handleExport = (format: "csv" | "xlsx" | "ics") => {
    if (!hasDraft) {
      toast.error("Create a draft calendar before exporting");
      return;
    }
    if (calendarEventsBundle === undefined) {
      toast.error("Calendar events are still loading. Please try again.");
      return;
    }

    setIsExporting(format);
    setIsExportMenuOpen(false);
    try {
      const exportData = buildExportData();
      const fiscalYearToken = String(bundle.fiscalYear?.label ?? "fiscal-year")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const baseFileName = `master-calendar-${fiscalYearToken || "fiscal-year"}`;

      if (format === "csv") {
        const csv = buildMasterCalendarAssignmentCsv(exportData);
        downloadBlobFile(`${baseFileName}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
        toast.success("Exported CSV assignment list");
        return;
      }

      if (format === "xlsx") {
        const bytes = buildMasterCalendarExportXlsxBytes(exportData);
        downloadBlobFile(
          `${baseFileName}.xlsx`,
          new Blob([bytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
        toast.success("Exported Excel workbook");
        return;
      }

      const ics = buildMasterCalendarIcs(exportData);
      downloadBlobFile(`${baseFileName}.ics`, new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      toast.success("Exported ICS calendar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export calendar");
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">Master Calendar Builder</h3>
            <p className="text-sm text-gray-600">
              {bundle.fiscalYear.label} ({bundle.fiscalYear.status}) - drag physicians from the heatmap into
              week/rotation cells
            </p>
            {hasDraft ? (
              <p className="text-xs text-gray-500 mt-1">Draft v{bundle.calendar.version}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
            {hasDraft ? (
              <div ref={exportMenuRef} className="relative">
                <button
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  disabled={isExporting !== null || calendarEventsBundle === undefined}
                  className="px-3 py-2 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isExporting
                    ? `Exporting ${isExporting.toUpperCase()}...`
                    : calendarEventsBundle === undefined
                      ? "Loading events..."
                      : "Export"}
                </button>
                {isExportMenuOpen ? (
                  <div className="absolute right-0 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      CSV - Assignment List
                    </button>
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
                    >
                      Excel (.xlsx) - 3 Sheets
                    </button>
                    <button
                      onClick={() => handleExport("ics")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
                    >
                      ICS - Calendar Events
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="font-semibold">Availability Heatmap</h4>
            <p className="text-xs text-gray-500">
              Green and yellow cells are draggable by week. Red cells are excluded from auto-assign.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
            {hasDraft ? (
              <button
                onClick={async () => {
                  setIsAutoAssigning(true);
                  try {
                    const result = await autoAssign({});
                    toast.success(
                      `${result.message} (${result.remainingUnstaffedCount} slot(s) still unstaffed)`,
                    );
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to auto-assign");
                  } finally {
                    setIsAutoAssigning(false);
                  }
                }}
                disabled={isAutoAssigning}
                className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isAutoAssigning ? "Running..." : "⚡ Auto-Assign"}
              </button>
            ) : null}
            <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">Green</span>
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">Yellow</span>
            <span className="px-2 py-1 rounded bg-rose-100 text-rose-800">Red</span>
          </div>
        </div>

        <div className="border border-gray-200 rounded-md overflow-auto max-h-[340px]">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-gray-700 sticky top-0">
              <tr>
                <th className="text-left px-2 py-2 min-w-[220px]">Physician</th>
                {weeks.map((week: any) => (
                  <th key={String(week._id)} className="px-1 py-2 min-w-[32px] text-center">
                    W{week.weekNumber}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {physicians.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={weeks.length + 1}>
                    No active physicians found.
                  </td>
                </tr>
              ) : (
                physicians.map((physician: any) => {
                  const physicianId = String(physician._id);
                  const cfte = cfteByPhysicianId.get(physicianId);
                  return (
                    <tr key={physicianId} className="border-t border-gray-100">
                      <td className="px-2 py-2">
                        <div className="font-medium text-xs">{physician.fullName}</div>
                        <div className="text-[10px] text-gray-500">
                          {physician.initials}
                          {cfte ? (
                            <>
                              {" "}
                              • {cfte.totalCfte.toFixed(3)}
                              {cfte.targetCfte === null ? "" : ` / ${cfte.targetCfte.toFixed(3)}`}
                            </>
                          ) : null}
                        </div>
                      </td>
                      {weeks.map((week: any) => {
                        const weekId = String(week._id);
                        const availability =
                          availabilityByKey.get(`${physicianId}:${weekId}`) ?? "yellow";
                        return (
                          <td key={`${physicianId}:${weekId}`} className="px-1 py-1">
                            <div
                              draggable
                              onDragStart={(event) => {
                                const payload = JSON.stringify({ physicianId, weekId });
                                event.dataTransfer.setData("application/json", payload);
                                event.dataTransfer.effectAllowed = "copy";
                                setDraggingPayload({ physicianId, weekId });
                              }}
                              onDragEnd={() => setDraggingPayload(null)}
                              className={`h-6 rounded border text-center text-[10px] font-semibold cursor-grab active:cursor-grabbing select-none ${getAvailabilityClasses(
                                availability,
                              )}`}
                              title={`${physician.fullName} • Week ${week.weekNumber} • ${availability}`}
                            >
                              {availability.charAt(0).toUpperCase()}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h4 className="font-semibold">cFTE Tracking</h4>
          <p className="text-xs text-gray-500">Updated after manual drops and auto-assign runs.</p>
        </div>
        <div className="border border-gray-200 rounded-md overflow-auto max-h-[240px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-700 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Physician</th>
                <th className="text-left px-3 py-2">Clinic</th>
                <th className="text-left px-3 py-2">Rotation</th>
                <th className="text-left px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Headroom</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.cfteSummary ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={7}>
                    No cFTE rows available.
                  </td>
                </tr>
              ) : (
                (bundle.cfteSummary ?? []).map((row: any) => (
                  <tr key={String(row.physicianId)} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.physicianName}</div>
                      <div className="text-[10px] text-gray-500">{row.initials}</div>
                    </td>
                    <td className="px-3 py-2">{row.clinicCfte.toFixed(3)}</td>
                    <td className="px-3 py-2">{row.rotationCfte.toFixed(3)}</td>
                    <td className="px-3 py-2">{row.totalCfte.toFixed(3)}</td>
                    <td className="px-3 py-2">
                      {row.targetCfte === null ? "-" : row.targetCfte.toFixed(3)}
                    </td>
                    <td className="px-3 py-2">
                      {row.headroom === null ? "-" : row.headroom.toFixed(3)}
                    </td>
                    <td className="px-3 py-2">
                      {row.targetCfte === null ? (
                        <span className="inline-flex px-2 py-1 rounded bg-gray-100 text-gray-700">no target</span>
                      ) : row.isOverTarget ? (
                        <span className="inline-flex px-2 py-1 rounded bg-rose-100 text-rose-800">over</span>
                      ) : (
                        <span className="inline-flex px-2 py-1 rounded bg-emerald-100 text-emerald-800">within</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!hasDraft ? (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-sm text-gray-600">
          No draft calendar yet. Create one to begin drag-and-drop assignments.
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="mb-3 text-xs text-gray-500">
            Drag from the heatmap and drop into a rotation cell for the same week.
          </div>
          <div className="border border-gray-200 rounded-md overflow-auto max-h-[640px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-700 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 min-w-[150px]">Week</th>
                  {rotations.map((rotation: any) => (
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
                    <td className="px-3 py-3 text-gray-500" colSpan={rotations.length + 1}>
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
                      {(row.cells ?? []).map((cell: any, index: number) => {
                        const weekId = String(row.weekId);
                        const rotationId = String(cell.rotationId);
                        const assignedPhysicianId = cell.physicianId ? String(cell.physicianId) : null;
                        const assignedPhysician = assignedPhysicianId
                          ? physicianById.get(assignedPhysicianId)
                          : null;
                        const assignedAvailability = assignedPhysicianId
                          ? availabilityByKey.get(`${assignedPhysicianId}:${weekId}`) ?? "yellow"
                          : null;
                        const isDroppingToSameWeek = draggingPayload?.weekId === weekId;
                        const isSavingCell = assigningCellKey === `${weekId}:${rotationId}`;

                        return (
                          <td
                            key={`${String(row.weekId)}:${index}`}
                            className={`px-2 py-2 align-top ${isDroppingToSameWeek ? "bg-blue-50/50" : ""}`}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const rawPayload = event.dataTransfer.getData("application/json");
                              if (!rawPayload) return;

                              try {
                                const payload = JSON.parse(rawPayload) as {
                                  physicianId?: string;
                                  weekId?: string;
                                };
                                if (!payload.physicianId || !payload.weekId) {
                                  toast.error("Invalid drag payload");
                                  return;
                                }
                                if (payload.weekId !== weekId) {
                                  toast.error(
                                    "Drop blocked: physician must be dragged from the same week in heatmap",
                                  );
                                  return;
                                }
                                void assignToCell(weekId, rotationId, payload.physicianId);
                              } catch {
                                toast.error("Invalid drag payload");
                              } finally {
                                setDraggingPayload(null);
                              }
                            }}
                          >
                            <div className="min-h-[64px] rounded border border-dashed border-gray-300 p-2 space-y-1 bg-white">
                              {assignedPhysician ? (
                                <>
                                  <div
                                    draggable
                                    onDragStart={(event) => {
                                      const payload = JSON.stringify({
                                        physicianId: assignedPhysicianId,
                                        weekId,
                                      });
                                      event.dataTransfer.setData("application/json", payload);
                                      event.dataTransfer.effectAllowed = "copy";
                                      setDraggingPayload({
                                        physicianId: String(assignedPhysicianId),
                                        weekId,
                                      });
                                    }}
                                    onDragEnd={() => setDraggingPayload(null)}
                                    className="rounded bg-blue-100 text-blue-800 px-2 py-1 text-[11px] font-medium cursor-grab active:cursor-grabbing"
                                  >
                                    {assignedPhysician.initials}
                                  </div>
                                  <div className="text-[10px] text-gray-600">
                                    {assignedPhysician.fullName}
                                  </div>
                                  {assignedAvailability ? (
                                    <span
                                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${getAvailabilityClasses(
                                        assignedAvailability,
                                      )}`}
                                    >
                                      {assignedAvailability}
                                    </span>
                                  ) : null}
                                  <div>
                                    <button
                                      onClick={() => {
                                        void assignToCell(weekId, rotationId, null);
                                      }}
                                      disabled={isSavingCell}
                                      className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="text-[11px] text-gray-400 pt-4 text-center">
                                  {isSavingCell ? "Saving..." : "Drop physician"}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
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
  myRotationPreferenceBundle,
  currentWeekBundle,
  myProfile,
}: {
  myRequestBundle: any;
  myRotationPreferenceBundle: any;
  currentWeekBundle: any;
  myProfile: any;
}) {
  const saveMyScheduleRequest = useMutation(api.functions.scheduleRequests.saveMyScheduleRequest);
  const setMyWeekPreference = useMutation(api.functions.scheduleRequests.setMyWeekPreference);
  const importWeekPreferences = useMutation(
    api.functions.scheduleRequests.importWeekPreferencesFromUpload,
  );
  const setMyRotationPreference = useMutation(api.functions.rotationPreferences.setMyRotationPreference);
  const submitMyScheduleRequest = useMutation(api.functions.scheduleRequests.submitMyScheduleRequest);

  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [availability, setAvailability] = useState<Availability>("green");
  const [reasonText, setReasonText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [savingRotation, setSavingRotation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [parsingImport, setParsingImport] = useState(false);
  const [importingWeeks, setImportingWeeks] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [parsedImport, setParsedImport] = useState<ParsedUploadPayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedRotationId, setSelectedRotationId] = useState("");
  const [rotationMode, setRotationMode] = useState<
    "do_not_assign" | "deprioritize" | "willing" | "preferred"
  >("willing");
  const [rotationPreferenceRank, setRotationPreferenceRank] = useState("1");
  const [rotationNote, setRotationNote] = useState("");

  useEffect(() => {
    setSpecialRequests(myRequestBundle?.request?.specialRequests ?? "");
  }, [myRequestBundle?.request?._id, myRequestBundle?.request?.specialRequests]);

  useEffect(() => {
    if (!selectedWeekId && currentWeekBundle?.weeks?.length > 0) {
      setSelectedWeekId(String(currentWeekBundle.weeks[0]._id));
    }
  }, [currentWeekBundle?.weeks, selectedWeekId]);

  useEffect(() => {
    if (!selectedRotationId && (myRotationPreferenceBundle?.rotations?.length ?? 0) > 0) {
      setSelectedRotationId(String(myRotationPreferenceBundle.rotations[0].rotation._id));
    }
  }, [myRotationPreferenceBundle?.rotations, selectedRotationId]);

  const preferenceByWeek = useMemo(() => {
    const map = new Map<string, any>();
    for (const preference of myRequestBundle?.weekPreferences ?? []) {
      map.set(String(preference.weekId), preference);
    }
    return map;
  }, [myRequestBundle?.weekPreferences]);

  const selectedPreference = selectedWeekId ? preferenceByWeek.get(selectedWeekId) : undefined;
  const rotationPreferenceByRotationId = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of myRotationPreferenceBundle?.rotations ?? []) {
      map.set(String(row.rotation._id), row.preference ?? null);
    }
    return map;
  }, [myRotationPreferenceBundle?.rotations]);

  const selectedRotationPreference = selectedRotationId
    ? rotationPreferenceByRotationId.get(selectedRotationId)
    : null;

  useEffect(() => {
    if (selectedPreference) {
      setAvailability(selectedPreference.availability);
      setReasonText(selectedPreference.reasonText ?? "");
    } else {
      setAvailability("green");
      setReasonText("");
    }
  }, [selectedWeekId, selectedPreference]);

  useEffect(() => {
    const selected = selectedRotationPreference;
    if (selected?.avoid) {
      setRotationMode("do_not_assign");
      setRotationPreferenceRank("1");
      setRotationNote(selected.avoidReason ?? "");
      return;
    }
    if (selected?.deprioritize) {
      setRotationMode("deprioritize");
      setRotationPreferenceRank("1");
      setRotationNote("");
      return;
    }
    if (selected?.preferenceRank !== undefined && selected?.preferenceRank !== null) {
      setRotationMode("preferred");
      setRotationPreferenceRank(String(selected.preferenceRank));
      setRotationNote("");
      return;
    }
    setRotationMode("willing");
    setRotationPreferenceRank("1");
    setRotationNote("");
  }, [selectedRotationId, selectedRotationPreference]);

  const canEdit = currentWeekBundle?.fiscalYear?.status === "collecting";
  const requiredRotationCount = myRotationPreferenceBundle?.requiredCount ?? 0;
  const configuredRotationCount = myRotationPreferenceBundle?.configuredCount ?? 0;
  const missingRotationNames: string[] = myRotationPreferenceBundle?.missingRotationNames ?? [];
  const isRotationMatrixComplete =
    myRotationPreferenceBundle?.isComplete ??
    (requiredRotationCount > 0 && configuredRotationCount === requiredRotationCount);
  const canSubmitRequest = canEdit && isRotationMatrixComplete;
  const importTargetPhysician: ImportTargetPhysician | null = myProfile
    ? {
        _id: String(myProfile._id),
        firstName: myProfile.firstName,
        lastName: myProfile.lastName,
        initials: myProfile.initials,
      }
    : null;

  const importValidationError = useMemo(
    () =>
      validateParsedUpload({
        payload: parsedImport,
        fiscalYearLabel: currentWeekBundle?.fiscalYear?.label,
        targetPhysician: importTargetPhysician,
        fiscalWeeks: currentWeekBundle?.weeks ?? [],
      }),
    [
      currentWeekBundle?.fiscalYear?.label,
      currentWeekBundle?.weeks,
      importTargetPhysician,
      parsedImport,
    ],
  );

  const handleParseImportFile = async (file: File | null | undefined) => {
    if (!file) return;

    setParsingImport(true);
    setImportError(null);
    setParsedImport(null);
    setImportFileName(file.name);

    try {
      const parsed = await parseScheduleImportFile(file);
      setParsedImport(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse upload file";
      setImportError(message);
      toast.error(message);
    } finally {
      setParsingImport(false);
    }
  };

  const handleImportWeekPreferencesFromFile = async () => {
    if (!parsedImport) {
      toast.error("Choose a file before importing");
      return;
    }
    if (importValidationError) {
      toast.error(importValidationError);
      return;
    }

    setImportingWeeks(true);
    try {
      const result = await importWeekPreferences({
        sourceFileName: parsedImport.sourceFileName,
        sourceDoctorToken: parsedImport.sourceDoctorToken,
        sourceFiscalYearLabel: parsedImport.sourceFiscalYearLabel,
        weeks: parsedImport.weeks.map((week) => ({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd ?? undefined,
          availability: week.availability,
        })),
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import week preferences");
    } finally {
      setImportingWeeks(false);
    }
  };

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

  const handleSaveRotationPreference = async () => {
    if (!selectedRotationId) {
      toast.error("Please select a rotation");
      return;
    }

    const parsedRank = Number(rotationPreferenceRank);
    if (rotationMode === "preferred") {
      if (!Number.isInteger(parsedRank) || parsedRank < 1) {
        toast.error("Preferred rotations require a positive integer rank");
        return;
      }
    }

    setSavingRotation(true);
    try {
      await setMyRotationPreference({
        rotationId: selectedRotationId as any,
        avoid: rotationMode === "do_not_assign",
        deprioritize: rotationMode === "deprioritize",
        preferenceRank: rotationMode === "preferred" ? parsedRank : undefined,
        avoidReason: rotationMode === "do_not_assign" ? rotationNote.trim() || undefined : undefined,
      });
      toast.success("Rotation preference saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rotation preference");
    } finally {
      setSavingRotation(false);
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

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">Import Week Preferences (CSV/XLSX)</h4>
        <p className="text-xs text-gray-600">
          Upload a completed FY template (`.xlsx`) or CSV (`week_start`, `preference`) to fully
          replace week preferences for this cycle.
        </p>

        <label className="text-sm block">
          <span className="block text-xs text-gray-600 mb-1">Upload File</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            disabled={!canEdit || parsingImport || importingWeeks}
            onChange={(event) => {
              const file = event.target.files?.[0];
              void handleParseImportFile(file);
              event.target.value = "";
            }}
            className="block w-full text-sm text-gray-700 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
          />
        </label>

        {importFileName ? (
          <p className="text-xs text-gray-600">
            Selected file: <span className="font-medium">{importFileName}</span>
          </p>
        ) : null}

        {parsingImport ? (
          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Parsing upload...
          </div>
        ) : null}

        {importError ? (
          <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            {importError}
          </div>
        ) : null}

        {parsedImport ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="text-xs text-gray-700">
              <span className="font-medium">Doctor token:</span> {parsedImport.sourceDoctorToken}
            </div>
            <div className="text-xs text-gray-700">
              <span className="font-medium">Fiscal year:</span> {parsedImport.sourceFiscalYearLabel}
            </div>
            <div className="text-xs text-gray-700">
              <span className="font-medium">Weeks parsed:</span> {parsedImport.weeks.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["red", "yellow", "green", "unset"] as UploadAvailability[]).map((value) => (
                <span
                  key={value}
                  className="inline-flex text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-700"
                >
                  {value}: {parsedImport.counts[value]}
                </span>
              ))}
            </div>
            {importValidationError ? (
              <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
                {importValidationError}
              </div>
            ) : (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                Upload validation passed. Import will replace this cycle's week preferences.
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            onClick={handleImportWeekPreferencesFromFile}
            disabled={
              !canEdit ||
              parsingImport ||
              importingWeeks ||
              !parsedImport ||
              Boolean(importValidationError)
            }
            className="px-3 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {importingWeeks ? "Importing..." : "Import Preferences"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">
          Inpatient Rotation Preferences (Do Not Assign vs Do Not Prefer)
        </h4>
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="font-medium text-gray-900">
            Completion: {configuredRotationCount}/{requiredRotationCount} rotations configured
          </div>
          <div className="mt-1 text-gray-700">
            Admin approval status:{" "}
            <StatusBadge status={myRotationPreferenceBundle?.approvalStatus ?? "pending"} />
          </div>
          {missingRotationNames.length > 0 ? (
            <div className="mt-1 text-amber-800">
              Missing: {missingRotationNames.join(", ")}
            </div>
          ) : (
            <div className="mt-1 text-emerald-700">
              Complete. Awaiting admin final approval for calendar mapping.
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Rotation</span>
            <select
              value={selectedRotationId}
              onChange={(e) => setSelectedRotationId(e.target.value)}
              disabled={!canEdit || savingRotation}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {(myRotationPreferenceBundle?.rotations ?? []).map((row: any) => (
                <option key={String(row.rotation._id)} value={String(row.rotation._id)}>
                  {row.rotation.name} ({row.rotation.abbreviation})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Preference Type</span>
            <select
              value={rotationMode}
              onChange={(e) => setRotationMode(e.target.value as any)}
              disabled={!canEdit || savingRotation}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="willing">Willing (neutral)</option>
              <option value="preferred">Preferred</option>
              <option value="deprioritize">Do Not Prefer (can do, assign less often)</option>
              <option value="do_not_assign">Do Not Assign (cannot do this rotation)</option>
            </select>
          </label>

          {rotationMode === "preferred" ? (
            <label className="text-sm">
              <span className="block text-xs text-gray-600 mb-1">Preference Rank</span>
              <input
                type="number"
                min="1"
                step="1"
                value={rotationPreferenceRank}
                onChange={(e) => setRotationPreferenceRank(e.target.value)}
                disabled={!canEdit || savingRotation}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          {rotationMode === "do_not_assign" ? (
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-600 mb-1">Reason (optional)</span>
              <input
                value={rotationNote}
                onChange={(e) => setRotationNote(e.target.value)}
                disabled={!canEdit || savingRotation}
                placeholder="Optional note explaining why this rotation is excluded"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveRotationPreference}
            disabled={!canEdit || savingRotation}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingRotation ? "Saving..." : "Save Rotation Preference"}
          </button>
        </div>

        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Rotation</th>
                <th className="text-left px-3 py-2">Preference</th>
                <th className="text-left px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {(myRotationPreferenceBundle?.rotations ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-500" colSpan={3}>
                    No active rotations available.
                  </td>
                </tr>
              ) : (
                (myRotationPreferenceBundle.rotations ?? []).map((row: any) => {
                  const preference = row.preference;
                  let label = preference ? "Willing" : "Not Set";
                  if (preference?.avoid) {
                    label = "Do Not Assign";
                  } else if (preference?.deprioritize) {
                    label = "Do Not Prefer";
                  } else if (preference?.preferenceRank !== undefined && preference?.preferenceRank !== null) {
                    label = `Preferred (Rank ${preference.preferenceRank})`;
                  }

                  return (
                    <tr key={String(row.rotation._id)} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {row.rotation.name} ({row.rotation.abbreviation})
                      </td>
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2 text-gray-700">{preference?.avoidReason ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canSubmitRequest || submitting}
          className="px-4 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
      {!isRotationMatrixComplete ? (
        <p className="text-xs text-amber-800">
          Submit is locked until every active rotation has an explicit preference.
        </p>
      ) : null}
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
        <a href="/trades" className="inline-block mt-1 text-xs text-blue-700 hover:text-blue-800 underline">
          Open dedicated Trades & Swaps page
        </a>
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

function AdminRotationPreferencePanel({ bundle }: { bundle: any }) {
  const setByAdmin = useMutation(api.functions.rotationPreferences.setPhysicianRotationPreferenceByAdmin);
  const approveForMapping = useMutation(
    api.functions.rotationPreferences.approveRotationPreferencesForMapping,
  );
  const [selectedPhysicianId, setSelectedPhysicianId] = useState("");
  const [selectedRotationId, setSelectedRotationId] = useState("");
  const [mode, setMode] = useState<"do_not_assign" | "deprioritize" | "willing" | "preferred">("willing");
  const [rank, setRank] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!selectedPhysicianId && (bundle?.physicians?.length ?? 0) > 0) {
      setSelectedPhysicianId(String(bundle.physicians[0]._id));
    }
  }, [bundle?.physicians, selectedPhysicianId]);

  useEffect(() => {
    if (!selectedRotationId && (bundle?.rotations?.length ?? 0) > 0) {
      setSelectedRotationId(String(bundle.rotations[0]._id));
    }
  }, [bundle?.rotations, selectedRotationId]);

  const selectedRow = useMemo(() => {
    return (bundle?.rows ?? []).find(
      (row: any) => String(row.physicianId) === selectedPhysicianId,
    );
  }, [bundle?.rows, selectedPhysicianId]);

  const selectedPreference = useMemo(() => {
    if (!selectedRow) return null;
    const match = (selectedRow.preferences ?? []).find(
      (entry: any) => String(entry.rotationId) === selectedRotationId,
    );
    return match?.preference ?? null;
  }, [selectedRow, selectedRotationId]);

  useEffect(() => {
    if (selectedPreference?.avoid) {
      setMode("do_not_assign");
      setRank("1");
      setNote(selectedPreference.avoidReason ?? "");
      return;
    }
    if (selectedPreference?.deprioritize) {
      setMode("deprioritize");
      setRank("1");
      setNote("");
      return;
    }
    if (
      selectedPreference?.preferenceRank !== undefined &&
      selectedPreference?.preferenceRank !== null
    ) {
      setMode("preferred");
      setRank(String(selectedPreference.preferenceRank));
      setNote("");
      return;
    }
    setMode("willing");
    setRank("1");
    setNote("");
  }, [selectedPreference, selectedPhysicianId, selectedRotationId]);

  if (!bundle?.fiscalYear) {
    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="font-semibold mb-2">Rotation Preference Alignment</h4>
        <p className="text-sm text-gray-600">No active fiscal year found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
      <div>
        <h4 className="font-semibold">Rotation Preference Alignment</h4>
        <p className="text-xs text-gray-600">
          Admin can finalize physician preference mode before heatmap mapping.
        </p>
      </div>

      {!bundle.rotationConfiguration?.isValid ? (
        <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
          {bundle.rotationConfiguration?.blockingReason}
          {bundle.rotationConfiguration?.missingRequiredNames?.length > 0 ? (
            <div className="mt-1">
              Missing required rotations: {bundle.rotationConfiguration.missingRequiredNames.join(", ")}
            </div>
          ) : null}
          {bundle.rotationConfiguration?.unexpectedNames?.length > 0 ? (
            <div className="mt-1">
              Unexpected active rotations: {bundle.rotationConfiguration.unexpectedNames.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniMetric label="Required/MD" value={String(bundle.summary?.requiredCountPerPhysician ?? 0)} />
        <MiniMetric label="Ready" value={String(bundle.summary?.readyForMappingCount ?? 0)} />
        <MiniMetric label="Pending" value={String(bundle.summary?.pendingApprovalCount ?? 0)} />
      </div>

      <label className="text-sm block">
        <span className="block text-xs text-gray-600 mb-1">Physician</span>
        <select
          value={selectedPhysicianId}
          onChange={(e) => setSelectedPhysicianId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={saving}
        >
          {(bundle.physicians ?? []).map((physician: any) => (
            <option key={String(physician._id)} value={String(physician._id)}>
              {physician.fullName} ({physician.initials})
            </option>
          ))}
        </select>
      </label>

      {selectedRow ? (
        <div className="rounded border border-gray-200 p-2 text-xs space-y-1 bg-gray-50">
          <div className="flex items-center justify-between">
            <span>
              Completion: {selectedRow.configuredCount}/{selectedRow.requiredCount}
            </span>
            <StatusBadge status={selectedRow.approvalStatus ?? "pending"} />
          </div>
          {(selectedRow.missingRotationNames ?? []).length > 0 ? (
            <div className="text-amber-800">
              Missing: {(selectedRow.missingRotationNames ?? []).join(", ")}
            </div>
          ) : null}
          {(selectedRow.blockingReasons ?? []).length > 0 ? (
            <div className="text-gray-700">{(selectedRow.blockingReasons ?? []).join(" ")}</div>
          ) : (
            <div className="text-emerald-700">Ready for mapping.</div>
          )}
        </div>
      ) : null}

      <label className="text-sm block">
        <span className="block text-xs text-gray-600 mb-1">Rotation</span>
        <select
          value={selectedRotationId}
          onChange={(e) => setSelectedRotationId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={saving}
        >
          {(bundle.rotations ?? []).map((rotation: any) => (
            <option key={String(rotation._id)} value={String(rotation._id)}>
              {rotation.name} ({rotation.abbreviation})
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm block">
        <span className="block text-xs text-gray-600 mb-1">Mode</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={saving}
        >
          <option value="willing">Willing (neutral)</option>
          <option value="preferred">Preferred</option>
          <option value="deprioritize">Do Not Prefer (can do, assign less often)</option>
          <option value="do_not_assign">Do Not Assign (cannot do this rotation)</option>
        </select>
      </label>

      {mode === "preferred" ? (
        <label className="text-sm block">
          <span className="block text-xs text-gray-600 mb-1">Rank</span>
          <input
            type="number"
            min="1"
            step="1"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            disabled={saving}
          />
        </label>
      ) : null}

      {mode === "do_not_assign" ? (
        <label className="text-sm block">
          <span className="block text-xs text-gray-600 mb-1">Reason (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            disabled={saving}
            placeholder="Optional admin note"
          />
        </label>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={async () => {
            if (!selectedPhysicianId) {
              toast.error("Select a physician");
              return;
            }
            if (!bundle.rotationConfiguration?.isValid) {
              toast.error(bundle.rotationConfiguration?.blockingReason ?? "Rotation configuration is invalid");
              return;
            }
            if (!selectedRow?.requestId) {
              toast.error("Cannot approve: no schedule request exists yet");
              return;
            }
            if ((selectedRow?.missingRotationNames ?? []).length > 0) {
              toast.error("Cannot approve until every active rotation has a saved preference");
              return;
            }

            setApproving(true);
            try {
              await approveForMapping({
                physicianId: selectedPhysicianId as any,
              });
              toast.success("Approved for calendar mapping");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to approve preferences");
            } finally {
              setApproving(false);
            }
          }}
          className="px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          disabled={
            approving ||
            saving ||
            !selectedPhysicianId ||
            !bundle.rotationConfiguration?.isValid ||
            !selectedRow?.requestId ||
            (selectedRow?.missingRotationNames ?? []).length > 0 ||
            selectedRow?.approvalStatus === "approved"
          }
        >
          {approving
            ? "Approving..."
            : selectedRow?.approvalStatus === "approved"
              ? "Approved"
              : "Approve for Mapping"}
        </button>
        <button
          onClick={async () => {
            if (!selectedPhysicianId || !selectedRotationId) {
              toast.error("Select a physician and rotation");
              return;
            }
            if (mode === "preferred") {
              const parsedRank = Number(rank);
              if (!Number.isInteger(parsedRank) || parsedRank < 1) {
                toast.error("Preferred mode requires a positive integer rank");
                return;
              }
            }

            setSaving(true);
            try {
              await setByAdmin({
                physicianId: selectedPhysicianId as any,
                rotationId: selectedRotationId as any,
                mode,
                preferenceRank: mode === "preferred" ? Number(rank) : undefined,
                note: mode === "do_not_assign" ? note.trim() || undefined : undefined,
              });
              toast.success("Preference saved");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to save preference");
            } finally {
              setSaving(false);
            }
          }}
          className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Preference"}
        </button>
      </div>

      <div className="max-h-60 overflow-auto border rounded-md border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <th className="text-left px-2 py-2">Physician</th>
              <th className="text-left px-2 py-2">Completion</th>
              <th className="text-left px-2 py-2">Approval</th>
              <th className="text-left px-2 py-2">Mapping</th>
            </tr>
          </thead>
          <tbody>
            {(bundle.rows ?? []).map((row: any) => (
              <tr key={String(row.physicianId)} className="border-t border-gray-100">
                <td className="px-2 py-2">
                  {row.physicianName} ({row.physicianInitials})
                </td>
                <td className="px-2 py-2">
                  {row.configuredCount}/{row.requiredCount}
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={row.approvalStatus ?? "pending"} />
                </td>
                <td className="px-2 py-2">
                  {row.isReadyForMapping ? (
                    <span className="text-emerald-700 font-medium">Ready</span>
                  ) : (
                    <span className="text-amber-700">Blocked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminWeekPreferenceImportPanel({
  physicians,
  currentWeekBundle,
}: {
  physicians: any[];
  currentWeekBundle: any;
}) {
  const importWeekPreferences = useMutation(
    api.functions.scheduleRequests.importWeekPreferencesFromUpload,
  );
  const activePhysicians: ImportTargetPhysician[] = useMemo(
    () =>
      (physicians ?? [])
        .filter((physician: any) => physician.isActive)
        .map((physician: any) => ({
          _id: String(physician._id),
          firstName: physician.firstName,
          lastName: physician.lastName,
          initials: physician.initials,
        }))
        .sort((a, b) => {
          const byLast = a.lastName.localeCompare(b.lastName);
          if (byLast !== 0) return byLast;
          return a.firstName.localeCompare(b.firstName);
        }),
    [physicians],
  );
  const [selectedPhysicianId, setSelectedPhysicianId] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [parsedImport, setParsedImport] = useState<ParsedUploadPayload | null>(null);
  const [parsingImport, setParsingImport] = useState(false);
  const [importingWeeks, setImportingWeeks] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPhysicianId && activePhysicians.length > 0) {
      setSelectedPhysicianId(activePhysicians[0]._id);
    }
  }, [activePhysicians, selectedPhysicianId]);

  const selectedPhysician =
    activePhysicians.find((physician) => physician._id === selectedPhysicianId) ?? null;
  const canEdit = currentWeekBundle?.fiscalYear?.status === "collecting";
  const importValidationError = useMemo(
    () =>
      validateParsedUpload({
        payload: parsedImport,
        fiscalYearLabel: currentWeekBundle?.fiscalYear?.label,
        targetPhysician: selectedPhysician,
        fiscalWeeks: currentWeekBundle?.weeks ?? [],
      }),
    [
      currentWeekBundle?.fiscalYear?.label,
      currentWeekBundle?.weeks,
      parsedImport,
      selectedPhysician,
    ],
  );

  const handleParseImportFile = async (file: File | null | undefined) => {
    if (!file) return;

    setParsingImport(true);
    setImportError(null);
    setParsedImport(null);
    setImportFileName(file.name);

    try {
      const parsed = await parseScheduleImportFile(file);
      setParsedImport(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse upload file";
      setImportError(message);
      toast.error(message);
    } finally {
      setParsingImport(false);
    }
  };

  const handleImport = async () => {
    if (!selectedPhysician) {
      toast.error("Select a physician");
      return;
    }
    if (!parsedImport) {
      toast.error("Choose a file before importing");
      return;
    }
    if (importValidationError) {
      toast.error(importValidationError);
      return;
    }

    setImportingWeeks(true);
    try {
      const result = await importWeekPreferences({
        targetPhysicianId: selectedPhysician._id as any,
        sourceFileName: parsedImport.sourceFileName,
        sourceDoctorToken: parsedImport.sourceDoctorToken,
        sourceFiscalYearLabel: parsedImport.sourceFiscalYearLabel,
        weeks: parsedImport.weeks.map((week) => ({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd ?? undefined,
          availability: week.availability,
        })),
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import week preferences");
    } finally {
      setImportingWeeks(false);
    }
  };

  if (!currentWeekBundle?.fiscalYear) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Admin Week Preference Import</h3>
        <p className="text-sm text-gray-600">No active fiscal year available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Admin Week Preference Import</h3>
        <p className="text-sm text-gray-600">
          Import a file and assign its week preferences to a selected physician.
        </p>
      </div>

      {!canEdit ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Import is locked because fiscal year status is <b>{currentWeekBundle.fiscalYear.status}</b>.
        </div>
      ) : null}

      <label className="text-sm block">
        <span className="block text-xs text-gray-600 mb-1">Physician</span>
        <select
          value={selectedPhysicianId}
          onChange={(event) => setSelectedPhysicianId(event.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={activePhysicians.length === 0 || importingWeeks}
        >
          {activePhysicians.length === 0 ? (
            <option value="">No active physicians</option>
          ) : (
            activePhysicians.map((physician) => (
              <option key={physician._id} value={physician._id}>
                {physician.lastName}, {physician.firstName} ({physician.initials})
              </option>
            ))
          )}
        </select>
      </label>

      <label className="text-sm block">
        <span className="block text-xs text-gray-600 mb-1">Upload File</span>
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={!canEdit || parsingImport || importingWeeks || activePhysicians.length === 0}
          onChange={(event) => {
            const file = event.target.files?.[0];
            void handleParseImportFile(file);
            event.target.value = "";
          }}
          className="block w-full text-sm text-gray-700 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
        />
      </label>

      {importFileName ? (
        <p className="text-xs text-gray-600">
          Selected file: <span className="font-medium">{importFileName}</span>
        </p>
      ) : null}

      {parsingImport ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Parsing upload...
        </div>
      ) : null}

      {importError ? (
        <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {importError}
        </div>
      ) : null}

      {parsedImport ? (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="text-xs text-gray-700">
            <span className="font-medium">Doctor token:</span> {parsedImport.sourceDoctorToken}
          </div>
          <div className="text-xs text-gray-700">
            <span className="font-medium">Fiscal year:</span> {parsedImport.sourceFiscalYearLabel}
          </div>
          <div className="text-xs text-gray-700">
            <span className="font-medium">Weeks parsed:</span> {parsedImport.weeks.length}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["red", "yellow", "green", "unset"] as UploadAvailability[]).map((value) => (
              <span
                key={value}
                className="inline-flex text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-700"
              >
                {value}: {parsedImport.counts[value]}
              </span>
            ))}
          </div>
          {importValidationError ? (
            <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
              {importValidationError}
            </div>
          ) : (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              Upload validation passed for selected physician.
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={handleImport}
          disabled={
            !canEdit ||
            parsingImport ||
            importingWeeks ||
            !selectedPhysician ||
            !parsedImport ||
            Boolean(importValidationError)
          }
          className="px-3 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {importingWeeks ? "Importing..." : "Import for Physician"}
        </button>
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
    viewer: "bg-gray-100 text-gray-700",
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
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
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
  const conferenceNames = ["CHEST", "SCCM", "ATS"] as const;
  const updateFiscalYearStatus = useMutation(api.functions.fiscalYears.updateFiscalYearStatus);
  const importUsPublicHolidays = useAction(
    api.functions.calendarEvents.importCurrentFiscalYearUsPublicHolidays,
  );
  const importReligiousObservances = useAction(
    api.functions.calendarEvents.importCurrentFiscalYearReligiousObservances,
  );
  const updateCalendarEvent = useMutation(api.functions.calendarEvents.updateCalendarEvent);
  const conferenceBundle = useQuery(
    api.functions.calendarEvents.getCurrentFiscalYearInstitutionalConferences,
    isAdmin ? {} : "skip",
  );
  const calendarEventsBundle = useQuery(
    api.functions.calendarEvents.getCurrentFiscalYearCalendarEvents,
    isAdmin ? {} : "skip",
  );
  const weeksBundle = useQuery(
    api.functions.fiscalYears.getWeeks,
    isAdmin && currentFY ? { fiscalYearId: currentFY._id } : "skip",
  );
  const setConferenceDate = useMutation(
    api.functions.calendarEvents.setCurrentFiscalYearInstitutionalConferenceDate,
  );
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isImportingHolidays, setIsImportingHolidays] = useState(false);
  const [holidayImportResult, setHolidayImportResult] = useState<string | null>(null);
  const [isImportingReligious, setIsImportingReligious] = useState(false);
  const [religiousImportResult, setReligiousImportResult] = useState<string | null>(null);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [conferenceDateDrafts, setConferenceDateDrafts] = useState<Record<string, string>>({});
  const [savingConferenceName, setSavingConferenceName] = useState<string | null>(null);

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

  useEffect(() => {
    if (!conferenceBundle?.conferences) return;
    const nextDrafts: Record<string, string> = {};
    for (const name of conferenceNames) {
      const row = conferenceBundle.conferences.find((conference: any) => conference.name === name);
      nextDrafts[name] = row?.date ?? "";
    }
    setConferenceDateDrafts(nextDrafts);
  }, [conferenceBundle?.fiscalYear?._id, conferenceBundle?.conferences]);

  const weekNumberById = useMemo(() => {
    const map = new Map<string, number>();
    if (!Array.isArray(weeksBundle)) return map;
    for (const week of weeksBundle) {
      map.set(String(week._id), Number(week.weekNumber));
    }
    return map;
  }, [weeksBundle]);

  const pendingReligiousEvents = useMemo(() => {
    const events = calendarEventsBundle?.events ?? [];
    return events
      .filter((event: any) => event.category === "religious_observance")
      .filter((event: any) => event.source === "calendarific")
      .filter((event: any) => !event.isApproved)
      .sort((a: any, b: any) => {
        const byDate = String(a.date).localeCompare(String(b.date));
        if (byDate !== 0) return byDate;
        return String(a.name).localeCompare(String(b.name));
      });
  }, [calendarEventsBundle?.events]);

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

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="font-medium text-sm">US Public Holidays (Nager.Date)</h4>
        <p className="text-sm text-gray-600">
          Pull US public holidays from Nager.Date (no API key) and map each event to fiscal-year weeks.
        </p>
        <button
          onClick={async () => {
            setIsImportingHolidays(true);
            try {
              const result = await importUsPublicHolidays({});
              setHolidayImportResult(
                `${result.message}. ${result.mappedHolidayCount} matched week(s), ${result.updatedCount} updated, ${result.skippedExistingCount} already present.`,
              );
              toast.success(result.message);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to import holidays from Nager.Date";
              setHolidayImportResult(`Error: ${message}`);
              toast.error(message);
            } finally {
              setIsImportingHolidays(false);
            }
          }}
          disabled={!currentFY || isImportingHolidays}
          className="px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isImportingHolidays ? "Importing..." : "Import US Public Holidays"}
        </button>
        {holidayImportResult ? <p className="text-xs text-gray-700">{holidayImportResult}</p> : null}
      </div>

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="font-medium text-sm">Religious Observances (Calendarific)</h4>
        <p className="text-sm text-gray-600">
          Pull US religious observances from Calendarific and map each event to fiscal-year weeks.
          Requires a `CALENDARIFIC_API_KEY` in the Convex deployment environment.
        </p>
        <button
          onClick={async () => {
            setIsImportingReligious(true);
            try {
              const result = await importReligiousObservances({});
              setReligiousImportResult(
                `${result.message}. ${result.mappedHolidayCount} matched week(s), ${result.updatedCount} updated, ${result.skippedExistingCount} already present.`,
              );
              toast.success(result.message);
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Failed to import religious observances from Calendarific";
              setReligiousImportResult(`Error: ${message}`);
              toast.error(message);
            } finally {
              setIsImportingReligious(false);
            }
          }}
          disabled={!currentFY || isImportingReligious}
          className="px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isImportingReligious ? "Importing..." : "Import Religious Observances"}
        </button>
        {religiousImportResult ? <p className="text-xs text-gray-700">{religiousImportResult}</p> : null}
      </div>

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="font-medium text-sm">Approve Religious Observances</h4>
        <p className="text-sm text-gray-600">
          Review Calendarific observances before they appear for non-admin users.
        </p>
        {calendarEventsBundle === undefined ? (
          <p className="text-sm text-gray-600">Loading observances...</p>
        ) : pendingReligiousEvents.length === 0 ? (
          <p className="text-sm text-gray-600">No pending religious observances.</p>
        ) : (
          <div className="border border-gray-200 rounded-md overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Week</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingReligiousEvents.map((event: any) => {
                  const weekNumber = event.weekId ? weekNumberById.get(String(event.weekId)) : null;
                  return (
                    <tr key={String(event._id)} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{event.date}</td>
                      <td className="px-3 py-2">{event.name}</td>
                      <td className="px-3 py-2">{weekNumber ? `Week ${weekNumber}` : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={async () => {
                              setSavingEventId(String(event._id));
                              try {
                                const result = await updateCalendarEvent({
                                  eventId: event._id,
                                  isApproved: true,
                                  isVisible: true,
                                });
                                toast.success(result.message);
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to approve observance",
                                );
                              } finally {
                                setSavingEventId(null);
                              }
                            }}
                            disabled={savingEventId !== null}
                            className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingEventId === String(event._id) ? "Saving..." : "Approve"}
                          </button>
                          <button
                            onClick={async () => {
                              setSavingEventId(String(event._id));
                              try {
                                const result = await updateCalendarEvent({
                                  eventId: event._id,
                                  isApproved: true,
                                  isVisible: false,
                                });
                                toast.success(result.message);
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to hide observance",
                                );
                              } finally {
                                setSavingEventId(null);
                              }
                            }}
                            disabled={savingEventId !== null}
                            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                          >
                            {savingEventId === String(event._id) ? "Saving..." : "Hide"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-md p-4 space-y-3">
        <h4 className="font-medium text-sm">Institutional Conferences (CHEST, SCCM, ATS)</h4>
        <p className="text-sm text-gray-600">
          These conference events are pre-loaded for each new fiscal year. Set/update this year&apos;s dates.
        </p>
        {conferenceBundle === undefined ? (
          <p className="text-sm text-gray-600">Loading conference placeholders...</p>
        ) : !conferenceBundle?.fiscalYear ? (
          <p className="text-sm text-gray-600">No active fiscal year found.</p>
        ) : (
          <div className="space-y-2">
            {conferenceNames.map((conferenceName) => (
              <div key={conferenceName} className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium w-20">{conferenceName}</label>
                <input
                  type="date"
                  value={conferenceDateDrafts[conferenceName] ?? ""}
                  onChange={(event) =>
                    setConferenceDateDrafts((prev) => ({
                      ...prev,
                      [conferenceName]: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  disabled={savingConferenceName === conferenceName}
                />
                <button
                  onClick={async () => {
                    const date = (conferenceDateDrafts[conferenceName] ?? "").trim();
                    if (!date) {
                      toast.error(`${conferenceName}: choose a date first`);
                      return;
                    }
                    setSavingConferenceName(conferenceName);
                    try {
                      const result = await setConferenceDate({
                        conferenceName,
                        date,
                      });
                      toast.success(result.message);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : `Failed to save ${conferenceName} conference date`,
                      );
                    } finally {
                      setSavingConferenceName(null);
                    }
                  }}
                  disabled={savingConferenceName !== null}
                  className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingConferenceName === conferenceName ? "Saving..." : "Save Date"}
                </button>
              </div>
            ))}
          </div>
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
