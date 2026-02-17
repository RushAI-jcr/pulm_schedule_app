"use client"

import { useState, useCallback, useMemo } from "react"
import { useQuery } from "convex/react"
import { ClipboardList, AlertTriangle, Lock } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { WizardShell } from "@/components/wizard/wizard-shell"
import { WeekAvailabilityStep } from "@/components/wizard/week-availability-step"
import { RotationPreferenceStep } from "@/components/wizard/rotation-preference-step"
import { ReviewSubmitStep } from "@/components/wizard/review-submit-step"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type SaveStatus = "idle" | "saving" | "saved" | "error"

export default function PreferencesPage() {
  const { isLoading: roleLoading } = useUserRole()
  const { fiscalYear, isCollecting, isLoading: fyLoading } = useFiscalYear()

  const [currentStep, setCurrentStep] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  // Fetch schedule request data (week preferences)
  const scheduleData = useQuery(api.functions.scheduleRequests.getMyScheduleRequest)
  // Fetch rotation preference data
  const rotationData = useQuery(api.functions.rotationPreferences.getMyRotationPreferences)
  // Fetch weeks + calendar events for week display
  const weekData = useQuery(api.functions.scheduleRequests.getCurrentFiscalYearWeeks)
  const eventData = useQuery(api.functions.calendarEvents.getCurrentFiscalYearCalendarEvents)

  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status)
    if (status === "saved") {
      setTimeout(() => setSaveStatus("idle"), 2000)
    }
  }, [])

  const readOnly = !isCollecting

  // Determine if all data is still loading
  const isLoading = roleLoading || fyLoading || scheduleData === undefined || rotationData === undefined || weekData === undefined || eventData === undefined

  // Prepare review data
  const reviewData = useMemo(() => {
    if (!scheduleData || !rotationData || !weekData) return null

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
  }, [scheduleData, rotationData, weekData])

  if (isLoading) {
    return (
      <>
        <PageHeader title="Schedule Preferences" description="Submit your annual scheduling preferences" />
        <PageSkeleton />
      </>
    )
  }

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

  // FY exists but not collecting
  if (readOnly) {
    const statusMessages: Record<string, string> = {
      setup: "The fiscal year is still being set up. Preference collection has not started yet.",
      building: "The collection window has closed. The admin is building the schedule.",
      published: "The schedule has been published for this fiscal year.",
      archived: "This fiscal year has been archived.",
    }

    return (
      <>
        <PageHeader
          title="Schedule Preferences"
          description={fiscalYear.label}
        />
        <div className="flex-1 p-4 md:p-6 space-y-4">
          {/* Read-only banner */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Preferences are read-only
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {statusMessages[fiscalYear.status] ?? "Preferences cannot be edited at this time."}
              </p>
            </div>
          </div>

          {/* Show wizard in read-only mode if data exists */}
          {reviewData && scheduleData?.request ? (
            <WizardShell
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              readOnly
            >
              {currentStep === 0 && weekData && (
                <WeekAvailabilityStep
                  weeks={weekData.weeks}
                  weekPreferences={scheduleData.weekPreferences.map((wp) => ({
                    weekId: wp.weekId,
                    availability: wp.availability,
                    reasonCategory: wp.reasonCategory,
                    reasonText: wp.reasonText,
                  }))}
                  calendarEvents={(eventData?.events ?? [])
                    .filter((e) => e.isVisible)
                    .map((e) => ({ weekId: e.weekId, name: e.name, category: e.category }))}
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
          {currentStep === 0 && weekData && (
            <WeekAvailabilityStep
              weeks={weekData.weeks}
              weekPreferences={scheduleData?.weekPreferences?.map((wp) => ({
                weekId: wp.weekId,
                availability: wp.availability,
                reasonCategory: wp.reasonCategory,
                reasonText: wp.reasonText,
              })) ?? []}
              calendarEvents={(eventData?.events ?? [])
                .filter((e) => e.isVisible)
                .map((e) => ({ weekId: e.weekId, name: e.name, category: e.category }))}
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
