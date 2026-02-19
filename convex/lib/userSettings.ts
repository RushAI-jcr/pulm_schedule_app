import { AppRole } from "./roles";

export type CalendarExportScope = "my" | "department";

export type NotificationPrefs = {
  schedulePublishedEmail: boolean;
  tradeRequestEmail: boolean;
  tradeStatusEmail: boolean;
  requestWindowEmail: boolean;
  inAppEnabled: boolean;
};

export type CalendarPrefs = {
  defaultExportScope: CalendarExportScope;
  includeCalendarEvents: boolean;
  defaultFormat: "ics";
};

export type UserSettingsShape = {
  notificationPrefs: NotificationPrefs;
  calendarPrefs: CalendarPrefs;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  schedulePublishedEmail: true,
  tradeRequestEmail: true,
  tradeStatusEmail: true,
  requestWindowEmail: true,
  inAppEnabled: true,
};

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  defaultExportScope: "my",
  includeCalendarEvents: true,
  defaultFormat: "ics",
};

export function normalizeNotificationPrefs(
  input?: Partial<NotificationPrefs> | null,
): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(input ?? {}),
  };
}

export function normalizeCalendarPrefs(
  input: Partial<CalendarPrefs> | null | undefined,
  role: AppRole,
): CalendarPrefs {
  const merged: CalendarPrefs = {
    ...DEFAULT_CALENDAR_PREFS,
    ...(input ?? {}),
    // Keep v1 constrained to ICS while preserving future schema extensibility.
    defaultFormat: "ics",
  };

  if (role !== "admin" && merged.defaultExportScope === "department") {
    merged.defaultExportScope = "my";
  }

  return merged;
}

export function mergeUserSettings(
  input: {
    notificationPrefs?: Partial<NotificationPrefs> | null;
    calendarPrefs?: Partial<CalendarPrefs> | null;
  } | null | undefined,
  role: AppRole,
): UserSettingsShape {
  return {
    notificationPrefs: normalizeNotificationPrefs(input?.notificationPrefs),
    calendarPrefs: normalizeCalendarPrefs(input?.calendarPrefs, role),
  };
}
