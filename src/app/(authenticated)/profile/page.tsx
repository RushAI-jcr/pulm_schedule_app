"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { User, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/shared/components/ui/button"
import { AccountDetailsCard } from "@/components/profile/account-details-card"
import { NotificationPreferencesCard } from "@/components/profile/notification-preferences-card"
import { CalendarExportCard } from "@/components/profile/calendar-export-card"
import { ProfileSettingsSkeleton } from "@/components/profile/profile-settings-skeleton"
import {
  DEFAULT_CALENDAR_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  type CalendarPrefsForm,
  type NotificationPrefsForm,
} from "@/components/profile/types"

type ConvexReturn<T extends { _returnType: unknown }> = T["_returnType"]
type AuthUser = NonNullable<ConvexReturn<typeof api.auth.loggedInUser>>
type PhysicianProfile = ConvexReturn<typeof api.functions.physicians.getMyProfile>
type UserSettings = ConvexReturn<typeof api.functions.userSettings.getMyUserSettings>

export default function ProfilePage() {
  const user = useQuery(api.auth.loggedInUser)
  const profile = useQuery(api.functions.physicians.getMyProfile, user ? {} : "skip")
  const settings = useQuery(api.functions.userSettings.getMyUserSettings, user ? {} : "skip")
  const updateSettings = useMutation(api.functions.userSettings.updateMyUserSettings)

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefsForm>(
    DEFAULT_NOTIFICATION_PREFS,
  )
  const [calendarPrefs, setCalendarPrefs] = useState<CalendarPrefsForm>(DEFAULT_CALENDAR_PREFS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings) return
    setNotificationPrefs(settings.notificationPrefs)
    setCalendarPrefs(settings.calendarPrefs)
  }, [settings?.updatedAt, settings?.calendarPrefs, settings?.notificationPrefs])

  const isLoading =
    user === undefined ||
    (user !== null && (profile === undefined || settings === undefined))

  const isDirty = useMemo(() => {
    if (!settings) return false
    return (
      JSON.stringify(notificationPrefs) !== JSON.stringify(settings.notificationPrefs) ||
      JSON.stringify(calendarPrefs) !== JSON.stringify(settings.calendarPrefs)
    )
  }, [settings, notificationPrefs, calendarPrefs])

  const canUseDepartmentScope = user?.role === "admin"

  const handleSave = async () => {
    if (!isDirty) return
    setSaving(true)
    try {
      const next = await updateSettings({
        notificationPrefs,
        calendarPrefs,
      })
      setNotificationPrefs(next.notificationPrefs)
      setCalendarPrefs(next.calendarPrefs)
      toast.success("Profile settings saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile settings"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <>
        <PageHeader title="Profile" description="Your account and notification settings" />
        <ProfileSettingsSkeleton />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <PageHeader title="Profile" description="Your account and notification settings" />
        <div className="flex-1 p-6">
          <EmptyState
            icon={User}
            title="Not signed in"
            description="Sign in to manage notification preferences, calendar export defaults, and account details."
          />
        </div>
      </>
    )
  }

  const safeSettings: UserSettings = settings ?? {
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    calendarPrefs: DEFAULT_CALENDAR_PREFS,
    updatedAt: null,
  }
  const effectiveCalendarPrefs: CalendarPrefsForm =
    !canUseDepartmentScope && calendarPrefs.defaultExportScope === "department"
      ? { ...calendarPrefs, defaultExportScope: "my" }
      : calendarPrefs
  const typedUser: AuthUser = user
  const typedProfile: PhysicianProfile = profile ?? null

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your account and notification settings"
        actions={
          <Button onClick={handleSave} disabled={saving || !isDirty} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        }
      />
      <div className="flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <AccountDetailsCard
            user={{
              workosUserId: typedUser.workosUserId,
              email: typedUser.email,
              firstName: typedUser.firstName,
              lastName: typedUser.lastName,
              role: typedUser.role,
              physicianId: typedUser.physicianId ? String(typedUser.physicianId) : null,
              lastLoginAt: typedUser.lastLoginAt,
            }}
            profile={
              typedProfile
                ? {
                    firstName: typedProfile.firstName,
                    lastName: typedProfile.lastName,
                    initials: typedProfile.initials,
                    email: typedProfile.email,
                    isActive: typedProfile.isActive,
                  }
                : null
            }
          />

          <NotificationPreferencesCard
            value={notificationPrefs}
            onChange={setNotificationPrefs}
            disabled={saving}
          />

          <CalendarExportCard
            value={effectiveCalendarPrefs}
            onChange={setCalendarPrefs}
            disabled={saving}
            canUseDepartmentScope={canUseDepartmentScope}
          />

          {!isDirty ? (
            <p className="text-xs text-muted-foreground">
              Preferences are up to date.
              {safeSettings.updatedAt ? ` Last saved: ${new Date(safeSettings.updatedAt).toLocaleString()}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You have unsaved changes.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
