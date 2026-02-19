"use client"

import { useState, useCallback, useMemo } from "react"
import { useQuery } from "convex/react"
import { ClipboardList, AlertTriangle, Lock } from "lucide-react"
import type { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { WizardShell } from "@/components/wizard/wizard-shell"
import { WeekAvailabilityStep } from "@/components/wizard/week-availability-step"
import { WeekImportPanel, type WeekImportTarget } from "@/components/wizard/week-import-panel"
import { RotationPreferenceStep } from "@/components/wizard/rotation-preference-step"
import { ReviewSubmitStep } from "@/components/wizard/review-submit-step"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type SaveStatus = "idle" | "saving" | "saved" | "error"

const STATUS_MESSAGES: Record<string, string> = {
  setup: "The fiscal year is still being set up. Preference collection has not started yet.",
  building: "The collection window has closed. The admin is building the schedule.",
  published: "The schedule has been published for this fiscal year.",
  archived: "This fiscal year has been archived.",
}

export default function PreferencesPage() {
  const { isLoading: roleLoading, isAdmin, physicianId } = useUserRole()
  const { fiscalYear, isCollecting, isLoading: fyLoading } = useFiscalYear()
  const hasLinkedPhysician = Boolean(physicianId)

  const [currentStep, setCurrentStep] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  const myProfile = useQuery(api.functions.physicians.getMyProfile, hasLinkedPhysician ? {} : "skip")
  const physicians = useQuery(api.functions.physicians.getPhysicians, isAdmin ? {} : "skip")

  const weekData = useQuery(api.functions.scheduleRequests.getCurrentFiscalYearWeeks)
  const scheduleData = useQuery(
    api.functions.scheduleRequests.getMyScheduleRequest,
    hasLinkedPhysician ? {} : "skip",
  )
  const rotationData = useQuery(
    api.functions.rotationPreferences.getMyRotationPreferences,
    hasLinkedPhysician ? {} : "skip",
  )
  const eventData = useQuery(
    api.functions.calendarEvents.getCurrentFiscalYearCalendarEvents,
    hasLinkedPhysician ? {} : "skip",
  )

  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status)
    if (status === "saved") {
      setTimeout(() => setSaveStatus("idle"), 2000)
    }
  }, [])

  const readOnly = !isCollecting

  const isLoading =
    roleLoading ||
    fyLoading ||
    weekData === undefined ||
    (isAdmin && physicians === undefined) ||
    (hasLinkedPhysician &&
      (scheduleData === undefined ||
        rotationData === undefined ||
        eventData === undefined ||
        myProfile === undefined))

  const importTargets = useMemo<WeekImportTarget[]>(() => {
    if (!physicians) return []
    return physicians
      .filter((physician) => physician.isActive)
      .map((physician) => ({
        id: physician._id,
        firstName: physician.firstName,
        lastName: physician.lastName,
        initials: physician.initials,
      }))
      .sort((a, b) => {
        const byLast = a.lastName.localeCompare(b.lastName)
        if (byLast !== 0) return byLast
        return a.firstName.localeCompare(b.firstName)
      })
  }, [physicians])

  const selfImportTarget = useMemo<WeekImportTarget | null>(() => {
    if (myProfile) {
      return {
        id: myProfile._id,
        firstName: myProfile.firstName,
        lastName: myProfile.lastName,
        initials: myProfile.initials,
      }
    }
    if (!physicianId) return null
    const matched = importTargets.find((target) => String(target.id) === String(physicianId))
    return matched ?? null
  }, [importTargets, myProfile, physicianId])

  const weekStepImportMode = isAdmin ? "admin" : "self"
  const weekStepImportTargets = useMemo(() => {
    if (isAdmin) return importTargets
    return selfImportTarget ? [selfImportTarget] : []
  }, [importTargets, isAdmin, selfImportTarget])

  const weekStepDefaultImportTargetId = useMemo<Id<"physicians"> | null>(() => {
    if (!isAdmin) {
      return selfImportTarget?.id ?? null
    }
    return selfImportTarget?.id ?? importTargets[0]?.id ?? null
  }, [importTargets, isAdmin, selfImportTarget])

  // Prepare review data
  const reviewData = useMemo(() => {
    if (!scheduleData || !rotationData || !weekData || !hasLinkedPhysician) return null

    const weekPreferences = (scheduleData.weekPreferences ?? []).map((wp) => ({
      weekId: wp.weekId,
      weekNumber: wp.week?.weekNumber ?? 0,
      startDate: wp.week?.startDate ?? "",
      endDate: wp.week?.endDate ?? "",
      availability: wp.availability,
      reasonCategory: wp.reasonCategory,
      reasonText: wp.reasonText,
    }))

    const rotationPreferences = (rotationData.rotations ?? []).map((r) => ({
      rotationName: r.rotation.name,
      rotationAbbr: r.rotation.abbreviation,
      preferenceRank: r.preference?.preferenceRank,
      avoid: r.preference?.avoid ?? false,
      deprioritize: r.preference?.deprioritize,
      avoidReason: r.preference?.avoidReason,
      isConfigured: r.preference !== null,
    }))

    return {
      weekPreferences,
      rotationPreferences,
      specialRequests: scheduleData.request?.specialRequests,
      requestStatus: scheduleData.request?.status ?? ("draft" as const),
      rotationCompleteness: {
        configured: rotationData.configuredCount,
        required: rotationData.requiredCount,
        isComplete: rotationData.isComplete,
      },
    }
  }, [hasLinkedPhysician, scheduleData, rotationData, weekData])

  if (isLoading) {
    return (
      <>
        <PageHeader title="Schedule Preferences" description="Submit your annual scheduling preferences" />
        <PageSkeleton />
      </>
    )
  }

  const renderReadOnlyBanner = () => (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Preferences are read-only
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          {STATUS_MESSAGES[fiscalYear?.status ?? ""] ?? "Preferences cannot be edited at this time."}
        </p>
      </div>
    </div>
  )

  // No fiscal year configured
  if (!fiscalYear) {
    return (
      <>
        <PageHeader title="Schedule Preferences" description="Submit your annual scheduling preferences" />
        <div className="flex-1 p-6">
          <EmptyState
            icon={ClipboardList}
            title="No fiscal year configured"
            description="There is no active fiscal year. Check back after the admin sets up the next fiscal year."
          />
        </div>
      </>
    )
  }

  if (!hasLinkedPhysician) {
    if (!isAdmin) {
      return (
        <>
          <PageHeader
            title="Schedule Preferences"
            description={fiscalYear.label}
          />
          <div className="flex-1 p-4 md:p-6 space-y-4">
            {readOnly && renderReadOnlyBanner()}
            <EmptyState
              icon={ClipboardList}
              title="Physician profile required"
              description="Your account is not linked to a physician profile. Contact an admin to complete account linking."
            />
          </div>
        </>
      )
    }

    return (
      <>
        <PageHeader
          title="Schedule Preferences"
          description={`${fiscalYear.label}${fiscalYear.requestDeadline ? ` · Deadline: ${fiscalYear.requestDeadline}` : ""}`}
        />
        <div className="flex-1 p-4 md:p-6 space-y-4">
          {readOnly && renderReadOnlyBanner()}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
            Admin account is not linked to a physician profile. Import on behalf of physicians is available below.
          </div>
          {importTargets.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No active physicians"
              description="Add or activate physician profiles before importing preferences."
            />
          ) : (
            <WeekImportPanel
              mode="admin"
              readOnly={readOnly}
              fiscalYearLabel={weekData?.fiscalYear?.label ?? fiscalYear.label}
              fiscalWeeks={weekData?.weeks ?? []}
              targets={importTargets}
              defaultTargetId={importTargets[0]?.id ?? null}
            />
          )}
        </div>
      </>
    )
  }

  const weekStepProps = {
    weeks: weekData?.weeks ?? [],
    weekPreferences:
      scheduleData?.weekPreferences?.map((wp) => ({
        weekId: wp.weekId,
        availability: wp.availability,
        reasonCategory: wp.reasonCategory,
        reasonText: wp.reasonText,
      })) ?? [],
    calendarEvents:
      (eventData?.events ?? [])
        .filter((e) => e.isVisible)
        .map((e) => ({ weekId: e.weekId, name: e.name, category: e.category })),
    importMode: weekStepImportTargets.length > 0 ? weekStepImportMode : undefined,
    importTargets: weekStepImportTargets,
    defaultImportTargetId: weekStepDefaultImportTargetId,
    fiscalYearLabel: weekData?.fiscalYear?.label ?? fiscalYear.label,
  } as const

  // FY exists but not collecting
  if (readOnly) {

    return (
      <>
        <PageHeader
          title="Schedule Preferences"
          description={fiscalYear.label}
        />
        <div className="flex-1 p-4 md:p-6 space-y-4">
          {renderReadOnlyBanner()}

          {/* Show wizard in read-only mode if data exists */}
          {reviewData && scheduleData?.request ? (
            <WizardShell
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              readOnly
            >
              {currentStep === 0 && (
                <WeekAvailabilityStep
                  {...weekStepProps}
                  readOnly
                />
              )}
              {currentStep === 1 && rotationData && (
                <RotationPreferenceStep
                  rotations={rotationData.rotations}
                  readOnly
                />
              )}
              {currentStep === 2 && reviewData && weekData && (
                <ReviewSubmitStep
                  data={reviewData}
                  totalWeeks={weekData.weeks.length}
                  readOnly
                />
              )}
            </WizardShell>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No preferences submitted"
              description="No schedule request was submitted for this fiscal year."
            />
          )}
        </div>
      </>
    )
  }

  // FY is collecting -- show the full wizard
  return (
    <>
      <PageHeader
        title="Schedule Preferences"
        description={`${fiscalYear.label}${fiscalYear.requestDeadline ? ` · Deadline: ${fiscalYear.requestDeadline}` : ""}`}
      />
      <div className="flex-1 p-4 md:p-6">
        {scheduleData?.request?.status === "submitted" && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
            <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Previously submitted
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Your request was submitted. Any changes will mark it as revised. You can re-submit when ready.
              </p>
            </div>
          </div>
        )}

        <WizardShell
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          saveStatus={saveStatus}
          canGoNext={true}
        >
          {currentStep === 0 && (
            <WeekAvailabilityStep
              {...weekStepProps}
              onSaveStatusChange={handleSaveStatusChange}
            />
          )}
          {currentStep === 1 && rotationData && (
            <RotationPreferenceStep
              rotations={rotationData.rotations}
              onSaveStatusChange={handleSaveStatusChange}
            />
          )}
          {currentStep === 2 && reviewData && weekData && (
            <ReviewSubmitStep
              data={reviewData}
              totalWeeks={weekData.weeks.length}
              onSaveStatusChange={handleSaveStatusChange}
            />
          )}
        </WizardShell>
      </div>
    </>
  )
}
