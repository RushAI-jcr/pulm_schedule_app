import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  mergeUserSettings,
  normalizeCalendarPrefs,
  normalizeNotificationPrefs,
} from "../convex/lib/userSettings";

describe("userSettings normalization", () => {
  it("returns defaults when no settings are stored", () => {
    const merged = mergeUserSettings(null, "viewer");

    expect(merged.notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(merged.calendarPrefs).toEqual(DEFAULT_CALENDAR_PREFS);
  });

  it("normalizes department scope to my for non-admin roles", () => {
    const prefs = normalizeCalendarPrefs({ defaultExportScope: "department" }, "physician");

    expect(prefs.defaultExportScope).toBe("my");
  });

  it("preserves department scope for admin role", () => {
    const prefs = normalizeCalendarPrefs({ defaultExportScope: "department" }, "admin");

    expect(prefs.defaultExportScope).toBe("department");
  });

  it("forces defaultFormat to ics", () => {
    const prefs = normalizeCalendarPrefs(
      {
        defaultFormat: "ics",
      },
      "admin",
    );

    expect(prefs.defaultFormat).toBe("ics");
  });

  it("merges partial notification preference updates", () => {
    const prefs = normalizeNotificationPrefs({ tradeStatusEmail: false });

    expect(prefs.tradeStatusEmail).toBe(false);
    expect(prefs.schedulePublishedEmail).toBe(true);
    expect(prefs.tradeRequestEmail).toBe(true);
  });

  it("merges stored settings and role-normalizes calendar prefs", () => {
    const merged = mergeUserSettings(
      {
        notificationPrefs: {
          schedulePublishedEmail: false,
        },
        calendarPrefs: {
          defaultExportScope: "department",
          includeCalendarEvents: false,
        },
      },
      "viewer",
    );

    expect(merged.notificationPrefs.schedulePublishedEmail).toBe(false);
    expect(merged.notificationPrefs.tradeRequestEmail).toBe(true);
    expect(merged.calendarPrefs.defaultExportScope).toBe("my");
    expect(merged.calendarPrefs.includeCalendarEvents).toBe(false);
  });
});
