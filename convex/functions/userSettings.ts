import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { requireAuthenticatedUser } from "../lib/auth";
import {
  mergeUserSettings,
  normalizeCalendarPrefs,
  normalizeNotificationPrefs,
} from "../lib/userSettings";

const notificationPrefsFullValidator = v.object({
  schedulePublishedEmail: v.boolean(),
  tradeRequestEmail: v.boolean(),
  tradeStatusEmail: v.boolean(),
  requestWindowEmail: v.boolean(),
  inAppEnabled: v.boolean(),
});

const calendarPrefsFullValidator = v.object({
  defaultExportScope: v.union(v.literal("my"), v.literal("department")),
  includeCalendarEvents: v.boolean(),
  defaultFormat: v.literal("ics"),
});

const notificationPrefsPatchValidator = v.object({
  schedulePublishedEmail: v.optional(v.boolean()),
  tradeRequestEmail: v.optional(v.boolean()),
  tradeStatusEmail: v.optional(v.boolean()),
  requestWindowEmail: v.optional(v.boolean()),
  inAppEnabled: v.optional(v.boolean()),
});

const calendarPrefsPatchValidator = v.object({
  defaultExportScope: v.optional(v.union(v.literal("my"), v.literal("department"))),
  includeCalendarEvents: v.optional(v.boolean()),
  defaultFormat: v.optional(v.literal("ics")),
});

async function getSingleSettingsRowOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string,
): Promise<Doc<"userSettings"> | null> {
  const rows = await ctx.db
    .query("userSettings")
    .withIndex("by_workosUserId", (q) => q.eq("workosUserId", workosUserId))
    .collect();

  if (rows.length > 1) {
    throw new Error("Data integrity error: duplicate user settings rows for this account");
  }

  return rows[0] ?? null;
}

export const getMyUserSettings = query({
  args: {},
  returns: v.object({
    notificationPrefs: notificationPrefsFullValidator,
    calendarPrefs: calendarPrefsFullValidator,
    updatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const currentUser = await requireAuthenticatedUser(ctx);
    const row = await getSingleSettingsRowOrThrow(ctx, currentUser.workosUserId);
    const merged = mergeUserSettings(row, currentUser.role);

    return {
      ...merged,
      updatedAt: row?.updatedAt ?? null,
    };
  },
});

export const updateMyUserSettings = mutation({
  args: {
    notificationPrefs: v.optional(notificationPrefsPatchValidator),
    calendarPrefs: v.optional(calendarPrefsPatchValidator),
  },
  returns: v.object({
    notificationPrefs: notificationPrefsFullValidator,
    calendarPrefs: calendarPrefsFullValidator,
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await requireAuthenticatedUser(ctx);
    const row = await getSingleSettingsRowOrThrow(ctx, currentUser.workosUserId);

    const nextNotificationPrefs = normalizeNotificationPrefs({
      ...(row?.notificationPrefs ?? {}),
      ...(args.notificationPrefs ?? {}),
    });

    const nextCalendarPrefs = normalizeCalendarPrefs(
      {
        ...(row?.calendarPrefs ?? {}),
        ...(args.calendarPrefs ?? {}),
      },
      currentUser.role,
    );

    const updatedAt = Date.now();

    if (row) {
      await ctx.db.patch(row._id, {
        notificationPrefs: nextNotificationPrefs,
        calendarPrefs: nextCalendarPrefs,
        updatedAt,
      });
    } else {
      await ctx.db.insert("userSettings", {
        workosUserId: currentUser.workosUserId,
        notificationPrefs: nextNotificationPrefs,
        calendarPrefs: nextCalendarPrefs,
        updatedAt,
      });
    }

    return {
      notificationPrefs: nextNotificationPrefs,
      calendarPrefs: nextCalendarPrefs,
      updatedAt,
    };
  },
});
