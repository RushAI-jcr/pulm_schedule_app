import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getCurrentPhysician, requireAdmin } from "../lib/auth";
import {
  canEditRequestForFiscalYear,
  FiscalYearStatus,
  nextScheduleRequestStatusAfterSave,
} from "../lib/workflowPolicy";
import { enforceRateLimit } from "../lib/rateLimit";
import { getSingleActiveFiscalYear, isRequestDeadlineOpen } from "../lib/fiscalYear";

const availabilityValidator = v.union(
  v.literal("green"),
  v.literal("yellow"),
  v.literal("red"),
);

type FunctionCtx = QueryCtx | MutationCtx;

async function getOrCreateRequest(
  ctx: MutationCtx,
  physicianId: Id<"physicians">,
  fiscalYearId: Id<"fiscalYears">,
) {
  const existing = await ctx.db
    .query("scheduleRequests")
    .withIndex("by_physician_fy", (q) =>
      q.eq("physicianId", physicianId).eq("fiscalYearId", fiscalYearId),
    )
    .collect();

  if (existing.length > 1) {
    throw new Error("Data integrity error: duplicate schedule requests for physician/fiscal year");
  }
  if (existing.length === 1) return existing[0];

  const requestId = await ctx.db.insert("scheduleRequests", {
    physicianId,
    fiscalYearId,
    status: "draft",
  });

  const created = await ctx.db.get(requestId);
  if (!created) {
    throw new Error("Failed to create schedule request");
  }
  return created;
}

function requireCollectingWindow(
  fiscalYear: Pick<Doc<"fiscalYears">, "status" | "requestDeadline">,
  now = Date.now(),
) {
  const fiscalYearStatus = fiscalYear.status as FiscalYearStatus;
  if (!canEditRequestForFiscalYear(fiscalYearStatus)) {
    throw new Error("Scheduling requests are only editable while fiscal year is collecting");
  }
  if (!isRequestDeadlineOpen(fiscalYear, now)) {
    throw new Error("Request deadline has passed for this fiscal year");
  }
}

export const getCurrentFiscalYearWeeks = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, weeks: [] };
    }

    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    weeks.sort((a, b) => a.weekNumber - b.weekNumber);

    return { fiscalYear, weeks };
  },
});

export const getMyScheduleRequest = query({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);

    if (!fiscalYear) {
      return { fiscalYear: null, request: null, weekPreferences: [] };
    }

    const request = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_physician_fy", (q) =>
        q.eq("physicianId", physician._id).eq("fiscalYearId", fiscalYear._id),
      )
      .first();

    if (!request) {
      return { fiscalYear, request: null, weekPreferences: [] };
    }

    const preferences = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
      .collect();

    const weeks = await ctx.db
      .query("weeks")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const weekById = new Map(weeks.map((w) => [w._id, w]));

    const weekPreferences = preferences
      .map((p) => ({
        ...p,
        week: weekById.get(p.weekId) ?? null,
      }))
      .filter((p) => p.week !== null)
      .sort((a, b) => a.week!.weekNumber - b.week!.weekNumber);

    return {
      fiscalYear,
      request,
      weekPreferences,
    };
  },
});

export const saveMyScheduleRequest = mutation({
  args: {
    specialRequests: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_request_save");

    const nextStatus = nextScheduleRequestStatusAfterSave(request.status);

    await ctx.db.patch(request._id, {
      specialRequests: args.specialRequests,
      status: nextStatus,
    });

    return { message: "Request saved" };
  },
});

export const setMyWeekPreference = mutation({
  args: {
    weekId: v.id("weeks"),
    availability: availabilityValidator,
    reasonCategory: v.optional(
      v.union(
        v.literal("vacation"),
        v.literal("conference"),
        v.literal("personal_religious"),
        v.literal("admin_leave"),
        v.literal("other"),
      ),
    ),
    reasonText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const week = await ctx.db.get(args.weekId);
    if (!week || week.fiscalYearId !== fiscalYear._id) {
      throw new Error("Invalid week selected");
    }

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_week_preference_set");

    const existing = await ctx.db
      .query("weekPreferences")
      .withIndex("by_request_week", (q) =>
        q.eq("scheduleRequestId", request._id).eq("weekId", args.weekId),
      )
      .first();

    const payload = {
      scheduleRequestId: request._id,
      weekId: args.weekId,
      availability: args.availability,
      reasonCategory: args.reasonCategory,
      reasonText: args.reasonText,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("weekPreferences", payload);
    }

    if (request.status === "submitted") {
      await ctx.db.patch(request._id, { status: "revised" });
    }

    return { message: "Week preference saved" };
  },
});

export const submitMyScheduleRequest = mutation({
  args: {},
  handler: async (ctx) => {
    const physician = await getCurrentPhysician(ctx);
    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) throw new Error("No fiscal year configured");

    requireCollectingWindow(fiscalYear);

    const request = await getOrCreateRequest(ctx, physician._id, fiscalYear._id);
    if (!request) throw new Error("Failed to load request");
    await enforceRateLimit(ctx, physician._id, "schedule_request_submit");

    await ctx.db.patch(request._id, {
      status: "submitted",
      submittedAt: Date.now(),
    });

    return { message: "Schedule request submitted" };
  },
});

export const getAdminScheduleRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const fiscalYear = await getSingleActiveFiscalYear(ctx);
    if (!fiscalYear) {
      return { fiscalYear: null, requests: [] };
    }

    const requests = await ctx.db
      .query("scheduleRequests")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYearId", fiscalYear._id))
      .collect();

    const hydrated: Array<
      Doc<"scheduleRequests"> & {
        physicianName: string;
        physicianInitials: string;
        preferenceCount: number;
      }
    > = [];
    for (const request of requests) {
      const physician = await ctx.db.get(request.physicianId);
      const preferenceCount = (
        await ctx.db
          .query("weekPreferences")
          .withIndex("by_request", (q) => q.eq("scheduleRequestId", request._id))
          .collect()
      ).length;

      hydrated.push({
        ...request,
        physicianName: physician
          ? `${physician.firstName} ${physician.lastName}`
          : "Unknown Physician",
        physicianInitials: physician?.initials ?? "--",
        preferenceCount,
      });
    }

    hydrated.sort((a, b) => {
      if (a.status === b.status) {
        return a.physicianName.localeCompare(b.physicianName);
      }
      return a.status.localeCompare(b.status);
    });

    return { fiscalYear, requests: hydrated };
  },
});
