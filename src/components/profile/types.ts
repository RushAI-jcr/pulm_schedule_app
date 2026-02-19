export type NotificationPrefsForm = {
  schedulePublishedEmail: boolean;
  tradeRequestEmail: boolean;
  tradeStatusEmail: boolean;
  requestWindowEmail: boolean;
  inAppEnabled: boolean;
};

export type CalendarPrefsForm = {
  defaultExportScope: "my" | "department";
  includeCalendarEvents: boolean;
  defaultFormat: "ics";
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsForm = {
  schedulePublishedEmail: true,
  tradeRequestEmail: true,
  tradeStatusEmail: true,
  requestWindowEmail: true,
  inAppEnabled: true,
};

export const DEFAULT_CALENDAR_PREFS: CalendarPrefsForm = {
  defaultExportScope: "my",
  includeCalendarEvents: true,
  defaultFormat: "ics",
};
